'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

import { TopBar } from '@/components/ui/top-bar'
import { MeetupDetails } from '@/components/web3/meetup-details'

type Tab = 'home' | 'map' | 'calendar' | 'my-meetups'

export default function MeetupDetailsPage({ params }: { params: { id: string } }) {
  const meetupId = parseInt(params.id, 10)
  const router = useRouter()

  const handleViewChange = (view: 'home' | 'create' | { details: number }) => {
    if (view === 'home') router.push('/app')
    else if (view === 'create') router.push('/create')
    else router.push(`/meetup/${view.details}`)
  }

  const handleTabChange = useCallback(
    (tab: Tab) => {
      router.push(`/app#${tab}`)
    },
    [router],
  )

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      <TopBar activeTab="home" onTabChange={handleTabChange} /> {/* Default to 'home' */}
      <main className="flex-1 p-4">
        <MeetupDetails meetupId={meetupId} onViewChange={handleViewChange} />
      </main>
      <footer className="p-4 text-center text-sm text-gray-600">
        © 2025 MeetupChain. Powered by xAI & Polkadot.
      </footer>
    </div>
  )
}
