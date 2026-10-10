import { TokenView } from '@/components/token/TokenView'

export default async function TokenPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params
  return <TokenView mint={mint} />
}
