'use client'

import { useEffect, useState } from 'react'

// New component
import { useInkathon } from '@scio-labs/use-inkathon'
import { toast } from 'react-hot-toast'

import { ConnectButton } from '@/components/web3/connect-button'
import { CreateMeetup } from '@/components/web3/create-meetup'
import { Home } from '@/components/web3/home'
import { MeetupCalendar } from '@/components/web3/meetup-calendar'
// New component
import { MeetupDetails } from '@/components/web3/meetup-details'
import { MeetupMap } from '@/components/web3/meetup-map'
import { UserLocation } from '@/components/web3/user-location'

export default function HomePage() {
  const { error } = useInkathon()
  const [currentView, setCurrentView] = useState<'home' | 'create' | { details: number }>('home')

  useEffect(() => {
    if (!error) return
    toast.error(error.message)
  }, [error])

  const handleViewChange = (view: 'home' | 'create' | { details: number }) => {
    setCurrentView(view)
  }

  return (
    <div className="container relative flex min-h-screen flex-col p-4">
      {/* Top Bar */}
      <div className="mb-4 flex w-full items-center justify-between">
        <UserLocation />
        <div className="flex gap-4">
          <button
            onClick={() => handleViewChange('create')}
            className="rounded-lg bg-blue-500 px-4 py-2 text-white shadow hover:bg-blue-600"
          >
            Create Meetup
          </button>
          <ConnectButton />
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="flex w-full flex-grow gap-6">
        {/* Left - World Map with Meetups */}
        <div className="min-w-[40%] flex-1">
          <MeetupMap onViewChange={handleViewChange} />
        </div>

        {/* Center - Dynamic View */}
        <div className="flex max-w-[40%] flex-1 flex-col items-center">
          {currentView === 'home' && <Home onViewChange={handleViewChange} />}
          {currentView === 'create' && <CreateMeetup onViewChange={handleViewChange} />}
          {typeof currentView === 'object' && 'details' in currentView && (
            <MeetupDetails meetupId={currentView.details} onViewChange={handleViewChange} />
          )}
        </div>

        {/* Right - Calendar */}
        <div className="min-w-[30%] flex-1">
          <MeetupCalendar onViewChange={handleViewChange} />
        </div>
      </div>
    </div>
  )
}
