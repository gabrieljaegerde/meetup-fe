'use client'

import Link from 'next/link'

import { useInkathon } from '@scio-labs/use-inkathon'

import { ConnectButton } from '@/components/web3/connect-button'

export default function LandingPage() {
  const { activeAccount } = useInkathon()

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Full-screen Map Background */}
      <div className="absolute inset-0 z-0">
        {/* <MeetupMap onViewChange={() => { }} /> No details view here */}
      </div>

      {/* Overlay */}
      <div className="relative z-10 flex min-h-screen flex-col bg-black/50">
        {/* Header */}
        <header className="flex items-center justify-between p-4">
          <h1 className="font-mono text-2xl font-bold text-white">MeetDot</h1>
          <ConnectButton />
        </header>

        {/* Hero */}
        <main className="flex flex-1 flex-col items-center justify-center text-center text-white">
          <h2 className="mb-4 font-mono text-5xl font-bold">Connecting the dots...</h2>
          <p className="mb-8 text-xl">Between the global polkadot community</p>
          <div className="flex gap-4">
            <Link
              href="/app"
              className="rounded-lg bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-700"
            >
              Explore Meetups
            </Link>
            <Link
              href="/create"
              className="rounded-lg bg-green-600 px-6 py-3 font-bold text-white hover:bg-green-700"
            >
              Create a Meetup
            </Link>
          </div>
        </main>

        {/* Footer */}
        <footer className="p-4 text-center text-sm text-gray-300">
          © 2025 MeetupChain. Powered by xAI & Polkadot.
        </footer>
      </div>
    </div>
  )
}
