/**
 * Token metadata JSON (the `uri` stored in the Token-2022 metadata). Stateless: everything comes
 * from the query string the launch wizard wrote into the uri, so nothing needs storing.
 *   ?n=name&s=symbol&i=<avatar id a1–a6 | https image url>&h=<holders %>&d=<description>
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params
  const url = new URL(req.url)
  const q = (k: string, max: number) => (url.searchParams.get(k) ?? '').slice(0, max)
  const img = q('i', 160)
  const image = /^a[1-6]$/.test(img) ? `${url.origin}/tokens/${img}.svg` : /^https:\/\//.test(img) ? img : `${url.origin}/tokens/a1.svg`
  const holdersPct = Number(q('h', 3))
  return Response.json(
    {
      name: q('n', 32),
      symbol: q('s', 10),
      description: q('d', 120) || 'A Holdfast launch: holders earn a perpetual share of the fees by how much × how long they hold.',
      image,
      external_url: `${url.origin}/t/${mint}`,
      properties: { holdfast: { holdersPct: Number.isFinite(holdersPct) && holdersPct >= 50 ? holdersPct : 60 } },
    },
    { headers: { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' } },
  )
}
