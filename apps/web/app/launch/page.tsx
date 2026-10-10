import { LaunchWizard } from '@/components/launch/LaunchWizard'

export const metadata = { title: 'Launch · Holdfast' }

export default function LaunchPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Launch a token</h1>
        <p className="mt-1 max-w-2xl text-muted">
          A Meteora bonding-curve launch with Holdfast built in: snipers locked out of the opening minutes, holders paid a share of every fee, forever.
        </p>
      </div>
      <LaunchWizard />
    </div>
  )
}
