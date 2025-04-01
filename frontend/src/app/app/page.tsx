'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { ContractIds } from '@/deployments/deployments'
import {
  contractQuery,
  decodeOutput,
  useInkathon,
  useRegisteredContract,
} from '@scio-labs/use-inkathon'
import toast from 'react-hot-toast'

import { TopBar } from '@/components/ui/top-bar'
import { Home } from '@/components/web3/home'
import { MeetupCalendar } from '@/components/web3/meetup-calendar'
import { MyMeetups } from '@/components/web3/my-meetups'
import { Meetup } from '@/types/meetup'

type Tab = 'home' | 'calendar' | 'my-meetups'

// Enhanced decodeVecU8 to handle hex strings, byte arrays, or plain strings
const decodeVecU8 = (vec: number[] | string | undefined): string => {
  if (!vec) return 'N/A'
  if (Array.isArray(vec)) {
    // Vec<u8> as number[]
    return new TextDecoder().decode(new Uint8Array(vec))
  }
  if (typeof vec === 'string') {
    if (vec.startsWith('0x')) {
      // Hex string (e.g., "0x66667364667364660a...")
      const bytes = Uint8Array.from(
        vec
          .slice(2)
          .match(/.{1,2}/g)!
          .map((byte) => parseInt(byte, 16)),
      )
      return new TextDecoder().decode(bytes)
    }
    // Plain string (for older meetups)
    return vec
  }
  return 'N/A'
}

const hasMeetupPassed = (meetup: Meetup, currentDate: Date): boolean => {
  try {
    const meetupDate = new Date(meetup.timestamp)
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: meetup.timezone || 'UTC',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    const meetupLocalTime = new Date(formatter.format(meetupDate))
    return meetupLocalTime < currentDate
  } catch (e) {
    console.error(`Error parsing meetup timestamp for ID ${meetup.id}:`, e)
    return false
  }
}

const fetchMeetups = async (
  api: any,
  contract: any,
  setMeetups: (meetups: Meetup[]) => void,
  setFetchIsLoading: (loading: boolean) => void,
) => {
  if (!contract || !api) return
  setFetchIsLoading(true)
  try {
    const result = await contractQuery(api, '', contract, 'get_all_meetups', {}, [true])
    const { output, isError, decodedOutput } = decodeOutput(result, contract, 'get_all_meetups')
    if (isError) throw new Error(decodedOutput)

    const meetupsData = output || []
    const results: Meetup[] = meetupsData.map(([id, meetup]: [number, any]) => {
      const rawLocation = meetup.location
      const locationType: 'Online' | 'InPerson' =
        meetup.location_type?._enum === 'Online' ||
        meetup.locationType === 'Online' ||
        meetup.loc_type === 'Online'
          ? 'Online'
          : 'InPerson'

      return {
        id,
        title: decodeVecU8(meetup.title),
        location:
          typeof rawLocation === 'string' ? decodeVecU8(rawLocation) : decodeVecU8(rawLocation),
        locationType,
        description: decodeVecU8(meetup.description), // Ensure proper decoding
        timestamp: parseInt(meetup.timestamp.replace(/,/g, '')),
        price: parseInt(meetup.price.replace(/,/g, '')),
        maxAttendees: parseInt(meetup.maxAttendees),
        attendees: meetup.attendees.map((attendee: any) => attendee.toString()),
        status: meetup.status as 'Planned' | 'Ongoing' | 'Ended' | 'Cancelled',
        totalPaid:
          typeof meetup.totalPaid === 'string'
            ? parseInt(meetup.totalPaid.replace(/,/g, ''))
            : meetup.totalPaid,
        host: meetup.host.toString(),
        timezone: decodeVecU8(meetup.timezone) || 'UTC',
      }
    })
    console.log('Fetched meetups:', results)
    setMeetups(results)
  } catch (e) {
    console.error(e)
    toast.error('Error fetching meetups. Try again…')
    setMeetups([])
  } finally {
    setFetchIsLoading(false)
  }
}

export default function AppPage() {
  const { api } = useInkathon()
  const { contract } = useRegisteredContract(ContractIds.Meetup)
  const [allMeetups, setAllMeetups] = useState<Meetup[]>([])
  const [currentTab, setCurrentTab] = useState<Tab>('home')
  const [fetchIsLoading, setFetchIsLoading] = useState(false)
  const [instanceKey, setInstanceKey] = useState(Date.now().toString())
  const router = useRouter()

  const currentDate = new Date()
  const activeMeetups = allMeetups.filter((meetup) => !hasMeetupPassed(meetup, currentDate))

  useEffect(() => {
    if (contract && api) fetchMeetups(api, contract, setAllMeetups, setFetchIsLoading)
  }, [contract, api])

  useEffect(() => {
    const updateTabFromHash = () => {
      const hash = window.location.hash.replace('#', '') as Tab
      const newTab = ['home', 'calendar', 'my-meetups'].includes(hash) ? hash : 'home'
      setCurrentTab(newTab)
      if (newTab === 'home') setInstanceKey(Date.now().toString())
    }
    updateTabFromHash()
    window.addEventListener('hashchange', updateTabFromHash)
    return () => window.removeEventListener('hashchange', updateTabFromHash)
  }, [])

  const refetchMeetups = () => {
    console.log('Refetching meetups...')
    if (contract && api) fetchMeetups(api, contract, setAllMeetups, setFetchIsLoading)
  }

  const handleViewChange = (view: 'home' | 'create' | { details: number }) => {
    if (view === 'home') {
      setCurrentTab('home')
      router.push('/app#home')
      setInstanceKey(Date.now().toString())
      refetchMeetups()
    } else if (view === 'create') {
      router.push('/create')
    } else {
      router.push(`/meetup/${view.details}`)
    }
  }

  const handleTabChange = (tab: Tab) => {
    setCurrentTab(tab)
    router.push(`/app#${tab}`)
    if (tab === 'home') setInstanceKey(Date.now().toString())
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-gray-100 to-gray-200">
      <TopBar activeTab={currentTab} onTabChange={handleTabChange} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 pb-6 pt-16">
        {currentTab === 'home' && (
          <div className="space-y-8">
            {fetchIsLoading ? (
              <div className="space-y-6">
                <div className="h-[500px] animate-pulse rounded-xl bg-gray-200 shadow-md" />
                <div className="space-y-6">
                  {Array(3)
                    .fill(0)
                    .map((_, i) => (
                      <div
                        key={i}
                        className="h-48 animate-pulse rounded-lg bg-gray-200 shadow-md"
                      />
                    ))}
                </div>
              </div>
            ) : (
              <Home
                key={`home-${instanceKey}`}
                meetups={activeMeetups}
                onViewChange={handleViewChange}
                fetchIsLoading={fetchIsLoading}
              />
            )}
          </div>
        )}
        {currentTab === 'calendar' && (
          <MeetupCalendar
            meetups={activeMeetups}
            fetchIsLoading={fetchIsLoading}
            onViewChange={handleViewChange}
          />
        )}
        {currentTab === 'my-meetups' && (
          <MyMeetups
            meetups={allMeetups}
            onViewChange={handleViewChange}
            refetchMeetups={refetchMeetups}
          />
        )}
      </main>
      <footer className="bg-white p-6 text-center text-sm text-gray-600 shadow-inner">
        © 2025 MeetupChain. Powered by xAI & Polkadot.
      </footer>
    </div>
  )
}
