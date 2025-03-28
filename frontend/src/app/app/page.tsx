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

const decodeVecU8 = (vec: number[] | undefined) =>
  vec ? new TextDecoder().decode(new Uint8Array(vec)) : 'N/A'

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
        location: typeof rawLocation === 'string' ? rawLocation : decodeVecU8(rawLocation),
        locationType,
        description: decodeVecU8(meetup.description),
        timestamp: parseInt(meetup.timestamp.replace(/,/g, '')),
        price: parseInt(meetup.price.replace(/,/g, '')),
        maxAttendees: parseInt(meetup.maxAttendees),
        attendees: meetup.attendees.map((attendee: any) => attendee.toString()),
        status: meetup.status?._enum || 'Planned',
        totalPaid: parseInt(meetup.totalPaid.replace(/,/g, '')),
        host: meetup.host.toString(),
        timezone: meetup.timezone || 'UTC',
      }
    })
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
  const [meetups, setMeetups] = useState<Meetup[]>([])
  const [currentTab, setCurrentTab] = useState<Tab>('home')
  const [fetchIsLoading, setFetchIsLoading] = useState(false)
  const [instanceKey, setInstanceKey] = useState(Date.now().toString()) // Unique key for component instances
  const router = useRouter()

  useEffect(() => {
    if (contract && api) fetchMeetups(api, contract, setMeetups, setFetchIsLoading)
  }, [contract, api])

  useEffect(() => {
    const updateTabFromHash = () => {
      const hash = window.location.hash.replace('#', '') as Tab
      const newTab = ['home', 'calendar', 'my-meetups'].includes(hash) ? hash : 'home'
      setCurrentTab(newTab)
      if (newTab === 'home') setInstanceKey(Date.now().toString()) // Reset key on home tab
    }
    updateTabFromHash()
    window.addEventListener('hashchange', updateTabFromHash)
    return () => window.removeEventListener('hashchange', updateTabFromHash)
  }, [])

  const handleViewChange = (view: 'home' | 'create' | { details: number }) => {
    if (view === 'home') {
      router.push('/app')
      setInstanceKey(Date.now().toString()) // Reset key when returning to home
    } else if (view === 'create') {
      router.push('/create')
    } else {
      router.push(`/meetup/${view.details}`)
    }
  }

  const handleTabChange = (tab: Tab) => {
    setCurrentTab(tab)
    router.push(`/app#${tab}`)
    if (tab === 'home') setInstanceKey(Date.now().toString()) // Reset key on home tab switch
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
                key={`home-${instanceKey}`} // Force unmount/remount
                meetups={meetups}
                onViewChange={handleViewChange}
                fetchIsLoading={fetchIsLoading}
              />
            )}
          </div>
        )}
        {currentTab === 'calendar' && (
          <MeetupCalendar
            meetups={meetups}
            fetchIsLoading={fetchIsLoading}
            onViewChange={handleViewChange}
          />
        )}
        {currentTab === 'my-meetups' && <MyMeetups onViewChange={handleViewChange} />}
      </main>
      <footer className="bg-white p-6 text-center text-sm text-gray-600 shadow-inner">
        © 2025 MeetupChain. Powered by xAI & Polkadot.
      </footer>
    </div>
  )
}
