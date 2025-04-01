'use client'

import { FC, useCallback, useEffect, useState } from 'react'

import { ContractIds } from '@/deployments/deployments'
import { u8aToHex } from '@polkadot/util'
import { decodeAddress } from '@polkadot/util-crypto'
import {
  contractQuery,
  contractTx,
  decodeOutput,
  useInkathon,
  useRegisteredContract,
} from '@scio-labs/use-inkathon'
import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  DollarSign,
  Loader2,
  MapPin,
  Users,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'

interface Meetup {
  id: number
  title: string
  location: string
  locationType: 'Online' | 'InPerson'
  description: string
  timestamp: number
  price: number
  maxAttendees: number
  attendees: string[]
  status: string
  totalPaid: number
  host: string
  timezone: string
}

interface MyMeetupsProps {
  meetups: Meetup[]
  onViewChange: (view: 'home' | 'create' | { details: number }) => void
  refetchMeetups: () => void
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

const hasMeetupStarted = (meetup: Meetup, currentDate: Date): boolean => {
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
    return meetupLocalTime <= currentDate
  } catch (e) {
    console.error(`Error parsing meetup timestamp for ID ${meetup.id}:`, e)
    return false
  }
}

export const MyMeetups: FC<MyMeetupsProps> = ({ meetups, onViewChange, refetchMeetups }) => {
  const { api, activeAccount } = useInkathon()
  const { contract } = useRegisteredContract(ContractIds.Meetup)
  const [hostedMeetups, setHostedMeetups] = useState<Meetup[]>([])
  const [attendingMeetups, setAttendingMeetups] = useState<Meetup[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [reputation, setReputation] = useState<number>(0)
  const [selectedAttendees, setSelectedAttendees] = useState<{ [meetupId: number]: string[] }>({})
  const [searchQuery, setSearchQuery] = useState<{ [meetupId: number]: string }>({})
  const [showEndConfirm, setShowEndConfirm] = useState<{
    meetupId: number | null
    totalPaid: number
  }>({ meetupId: null, totalPaid: 0 })

  const currentDate = new Date()

  const filterMyMeetups = useCallback(() => {
    if (!activeAccount || !meetups.length) return
    const pubKey = u8aToHex(decodeAddress(activeAccount.address))
    setHostedMeetups(meetups.filter((m) => u8aToHex(decodeAddress(m.host)) === pubKey))
    setAttendingMeetups(
      meetups.filter((m) => m.attendees.some((a) => u8aToHex(decodeAddress(a)) === pubKey)),
    )
  }, [activeAccount, meetups])

  const fetchReputation = useCallback(async () => {
    if (!contract || !api || !activeAccount) return
    setIsLoading(true)
    try {
      const repResult = await contractQuery(api, '', contract, 'get_reputation_score', {}, [
        activeAccount.address,
      ])
      const { output: repOutput } = decodeOutput(repResult, contract, 'get_reputation_score')
      setReputation(repOutput || 0)
    } catch (e: unknown) {
      console.error('Error fetching reputation:', e)
      toast.error(`Error fetching reputation: ${(e as Error).message || 'Unknown error'}`)
    } finally {
      setIsLoading(false)
    }
  }, [api, contract, activeAccount])

  const updateStatus = useCallback(
    async (meetupId: number, newStatus: 'Ongoing' | 'Ended') => {
      if (!contract || !api || !activeAccount) return
      try {
        if (newStatus === 'Ended') {
          const meetup = hostedMeetups.find((m) => m.id === meetupId)
          setShowEndConfirm({ meetupId, totalPaid: meetup?.totalPaid || 0 })
          return
        }
        await contractTx(api, activeAccount.address, contract, 'update_state', {}, [
          meetupId,
          newStatus,
        ])
        toast.success(`Status updated to ${newStatus}!`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        refetchMeetups()
        filterMyMeetups()
      } catch (e: unknown) {
        console.error('Error updating status:', e)
        toast.error(`Error updating status: ${(e as Error).message || 'Unknown error'}`)
      }
    },
    [api, activeAccount, contract, filterMyMeetups, refetchMeetups, hostedMeetups],
  )

  const confirmEndMeetup = async (meetupId: number) => {
    if (!contract || !api || !activeAccount) return
    try {
      await contractTx(api, activeAccount.address, contract, 'update_state', {}, [
        meetupId,
        'Ended',
      ])
      toast.success('Meetup ended!')
      await new Promise((resolve) => setTimeout(resolve, 2000))
      refetchMeetups()
      filterMyMeetups()
      setShowEndConfirm({ meetupId: null, totalPaid: 0 })
    } catch (e: unknown) {
      console.error('Error ending meetup:', e)
      toast.error(`Error ending meetup: ${(e as Error).message || 'Unknown error'}`)
    }
  }

  const cancelMeetup = useCallback(
    async (meetupId: number) => {
      if (!contract || !api || !activeAccount) return
      try {
        await contractTx(api, activeAccount.address, contract, 'cancel_meetup', {}, [meetupId])
        toast.success('Meetup cancelled!')
        await new Promise((resolve) => setTimeout(resolve, 2000))
        refetchMeetups()
        filterMyMeetups()
      } catch (e: unknown) {
        console.error('Error cancelling meetup:', e)
        toast.error(`Error cancelling meetup: ${(e as Error).message || 'Unknown error'}`)
      }
    },
    [api, activeAccount, contract, filterMyMeetups, refetchMeetups],
  )

  const distributeRevenue = useCallback(
    async (meetupId: number) => {
      if (!contract || !api || !activeAccount) return
      try {
        await contractTx(api, activeAccount.address, contract, 'distribute_revenue', {}, [meetupId])
        toast.success('Revenue distributed!')
        await new Promise((resolve) => setTimeout(resolve, 2000))
        refetchMeetups()
        filterMyMeetups()
      } catch (e: unknown) {
        console.error('Error distributing revenue:', e)
        toast.error(`Error distributing revenue: ${(e as Error).message || 'Unknown error'}`)
      }
    },
    [api, activeAccount, contract, filterMyMeetups, refetchMeetups],
  )

  const checkIn = useCallback(
    async (meetupId: number, asHost: boolean, attendeeAddresses?: string[]) => {
      if (!contract || !api || !activeAccount) return
      try {
        if (asHost && attendeeAddresses && attendeeAddresses.length > 0) {
          // Decode SS58 addresses to raw 32-byte AccountIds
          const decodedAddresses = attendeeAddresses.map((address) => decodeAddress(address))
          // Batch check-in with a single transaction
          await contractTx(api, activeAccount.address, contract, 'check_in', {}, [
            meetupId,
            decodedAddresses,
          ])
          toast.success(`Checked in ${attendeeAddresses.length} attendees!`)
        } else {
          await contractTx(api, activeAccount.address, contract, 'check_in', {}, [
            meetupId,
            activeAccount.address,
          ])
          toast.success('Checked in successfully!')
        }
        await new Promise((resolve) => setTimeout(resolve, 2000))
        refetchMeetups()
        filterMyMeetups()
      } catch (e: unknown) {
        console.error('Error checking in:', e)
        toast.error(`Error checking in: ${(e as Error).message || 'Unknown error'}`)
      }
    },
    [api, activeAccount, contract, filterMyMeetups, refetchMeetups],
  )

  const unregisterFromMeetup = useCallback(
    async (meetupId: number) => {
      if (!contract || !api || !activeAccount) return
      try {
        await contractTx(api, activeAccount.address, contract, 'unregister_from_meetup', {}, [
          meetupId,
        ])
        toast.success('Unregistered from meetup!')
        await new Promise((resolve) => setTimeout(resolve, 2000))
        refetchMeetups()
        filterMyMeetups()
      } catch (e: unknown) {
        console.error('Error unregistering:', e)
        toast.error(`Error unregistering: ${(e as Error).message || 'Unknown error'}`)
      }
    },
    [api, activeAccount, contract, filterMyMeetups, refetchMeetups],
  )

  const handleAttendeeSelection = (meetupId: number, address: string) => {
    const currentSelected = selectedAttendees[meetupId] || []
    if (currentSelected.includes(address)) {
      setSelectedAttendees({
        ...selectedAttendees,
        [meetupId]: currentSelected.filter((a) => a !== address),
      })
    } else {
      setSelectedAttendees({
        ...selectedAttendees,
        [meetupId]: [...currentSelected, address],
      })
    }
  }

  useEffect(() => {
    filterMyMeetups()
    fetchReputation()
  }, [filterMyMeetups, fetchReputation])

  if (!api || !activeAccount) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="rounded-2xl bg-white p-6 shadow-lg">
          <p className="text-lg font-medium text-gray-700">
            Please connect your wallet to view your meetups.
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="flex items-center gap-2 rounded-2xl bg-white p-6 shadow-lg">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          <p className="text-lg font-medium text-gray-700">Loading your reputation…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="text-center">
          <h2 className="text-4xl font-extrabold tracking-tight text-gray-900">My Meetups</h2>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="rounded-md bg-indigo-100 px-2 py-1 text-sm text-indigo-800">
              Reputation Score: {reputation}
            </span>
          </div>
        </div>

        {/* Hosted Meetups */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="border-b border-indigo-100 bg-indigo-50 p-6">
            <h3 className="text-2xl font-semibold text-indigo-900">Hosted Meetups</h3>
          </div>
          <div className="space-y-6 p-6">
            {hostedMeetups.length === 0 ? (
              <p className="text-center italic text-gray-500">
                You are not hosting any meetups yet.
              </p>
            ) : (
              hostedMeetups.map((meetup) => {
                const isPast = hasMeetupPassed(meetup, currentDate)
                const hasStarted = hasMeetupStarted(meetup, currentDate)
                const filteredAttendees = meetup.attendees.filter((a) =>
                  a.toLowerCase().includes((searchQuery[meetup.id] || '').toLowerCase()),
                )
                return (
                  <div
                    key={meetup.id}
                    className={`rounded-xl bg-gray-50 p-4 shadow-sm transition-shadow duration-200 hover:shadow-md ${
                      isPast ? 'border-2 border-red-500' : ''
                    }`}
                  >
                    <div className="space-y-1">
                      <h4 className="text-xl font-semibold text-gray-800">{meetup.title}</h4>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(meetup.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Users className="h-4 w-4" />
                        <span>
                          {meetup.attendees.length}/{meetup.maxAttendees} Attendees
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <DollarSign className="h-4 w-4" />
                        <span>
                          {meetup.status === 'Planned'
                            ? `Expected Payout: ${((meetup.price * meetup.attendees.length) / 1e18).toFixed(2)} SBY`
                            : `Payout: ${(meetup.totalPaid / 1e18).toFixed(2)} SBY`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-gray-600" />
                        <span
                          className={`rounded-md px-2 py-1 text-sm ${
                            meetup.status === 'Planned'
                              ? 'bg-blue-100 text-blue-800'
                              : meetup.status === 'Ongoing'
                                ? 'bg-green-100 text-green-800'
                                : meetup.status === 'Ended'
                                  ? 'bg-gray-100 text-gray-800'
                                  : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {meetup.status}
                        </span>
                      </div>
                    </div>
                    {meetup.status === 'Planned' && !hasStarted && (
                      <div className="mt-2 flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-2 text-sm text-yellow-800">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Canceling an event will return your deposit.</span>
                      </div>
                    )}
                    {meetup.status === 'Planned' && hasStarted && (
                      <div className="mt-2 flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-2 text-sm text-yellow-800">
                        <AlertTriangle className="h-4 w-4" />
                        <span>
                          Be sure to start the meetup for attendees to check in and to receive
                          payment. Or cancel to receive your deposit back.
                        </span>
                      </div>
                    )}
                    {meetup.status === 'Ongoing' && (
                      <div className="mt-2 flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-2 text-sm text-yellow-800">
                        <AlertTriangle className="h-4 w-4" />
                        <span>
                          Payment will only be received for attendees who have checked in and been
                          checked in by you.
                        </span>
                      </div>
                    )}
                    <hr className="my-4 border-gray-200" />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => onViewChange({ details: meetup.id })}
                        variant="outline"
                        className="border-indigo-300 text-indigo-600 transition-colors hover:bg-indigo-50"
                      >
                        View Details
                      </Button>
                      {meetup.status === 'Planned' && (
                        <>
                          {hasStarted && (
                            <Button
                              onClick={() => updateStatus(meetup.id, 'Ongoing')}
                              className="border-2 border-red-500 bg-green-600 text-white hover:bg-green-700"
                            >
                              Start Meetup
                            </Button>
                          )}
                          <Button
                            onClick={() => cancelMeetup(meetup.id)}
                            className="bg-red-600 text-white hover:bg-red-700"
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                      {meetup.status === 'Ongoing' && (
                        <>
                          <Button
                            onClick={() => updateStatus(meetup.id, 'Ended')}
                            className="bg-yellow-600 text-white hover:bg-yellow-700"
                          >
                            End Meetup
                          </Button>
                          <div className="mt-2 w-full">
                            <h5 className="text-sm font-semibold text-gray-800">
                              Check-In Attendees
                            </h5>
                            <input
                              type="text"
                              placeholder="Search attendees..."
                              value={searchQuery[meetup.id] || ''}
                              onChange={(e) =>
                                setSearchQuery({ ...searchQuery, [meetup.id]: e.target.value })
                              }
                              className="w-full rounded-md border border-gray-300 p-2 focus:border-indigo-500 focus:ring-indigo-500"
                            />
                            <div className="mt-2 max-h-40 overflow-y-auto">
                              {filteredAttendees.map((attendee) => (
                                <div key={attendee} className="flex items-center gap-2 p-1">
                                  <input
                                    type="checkbox"
                                    checked={(selectedAttendees[meetup.id] || []).includes(
                                      attendee,
                                    )}
                                    onChange={() => handleAttendeeSelection(meetup.id, attendee)}
                                  />
                                  <span className="text-gray-800">
                                    {attendee.slice(0, 6)}...{attendee.slice(-4)}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <Button
                              onClick={() => checkIn(meetup.id, true, selectedAttendees[meetup.id])}
                              disabled={!selectedAttendees[meetup.id]?.length}
                              className="mt-2 border-2 border-red-500 bg-purple-600 text-white hover:bg-purple-700 disabled:bg-purple-400 disabled:opacity-100"
                            >
                              Check In Selected
                            </Button>
                          </div>
                        </>
                      )}
                      {meetup.status === 'Ended' && (
                        <Button
                          onClick={() => distributeRevenue(meetup.id)}
                          className="bg-teal-600 text-white hover:bg-teal-700"
                        >
                          Distribute Revenue
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Attending Meetups */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="border-b border-indigo-100 bg-indigo-50 p-6">
            <h3 className="text-2xl font-semibold text-indigo-900">Attending Meetups</h3>
          </div>
          <div className="space-y-6 p-6">
            {attendingMeetups.length === 0 ? (
              <p className="text-center italic text-gray-500">
                You’re not registered for any meetups yet.
              </p>
            ) : (
              attendingMeetups.map((meetup) => {
                const isPast = hasMeetupPassed(meetup, currentDate)
                const hasStarted = hasMeetupStarted(meetup, currentDate)
                return (
                  <div
                    key={meetup.id}
                    className={`rounded-xl bg-gray-50 p-4 shadow-sm transition-shadow duration-200 hover:shadow-md ${
                      isPast ? 'border-2 border-red-500' : ''
                    }`}
                  >
                    <div className="space-y-1">
                      <h4 className="text-xl font-semibold text-gray-800">{meetup.title}</h4>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(meetup.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Users className="h-4 w-4" />
                        <span>
                          Host: {meetup.host.slice(0, 6)}...{meetup.host.slice(-4)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-gray-600" />
                        <span
                          className={`rounded-md px-2 py-1 text-sm ${
                            meetup.status === 'Planned'
                              ? 'bg-blue-100 text-blue-800'
                              : meetup.status === 'Ongoing'
                                ? 'bg-green-100 text-green-800'
                                : meetup.status === 'Ended'
                                  ? 'bg-gray-100 text-gray-800'
                                  : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {meetup.status}
                        </span>
                      </div>
                    </div>
                    {meetup.status === 'Planned' && hasStarted && (
                      <div className="mt-2 flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-2 text-sm text-yellow-800">
                        <AlertTriangle className="h-4 w-4" />
                        <span>
                          The meetup time has started. Ask the host to start it so you can check in.
                        </span>
                      </div>
                    )}
                    {meetup.status === 'Ongoing' && (
                      <div className="mt-2 flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-2 text-sm text-yellow-800">
                        <AlertTriangle className="h-4 w-4" />
                        <span>
                          You will only receive your deposit back if you check yourself in.
                        </span>
                      </div>
                    )}
                    <hr className="my-4 border-gray-200" />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => onViewChange({ details: meetup.id })}
                        variant="outline"
                        className="border-indigo-300 text-indigo-600 transition-colors hover:bg-indigo-50"
                      >
                        View Details
                      </Button>
                      {meetup.status === 'Planned' && (
                        <Button
                          onClick={() => unregisterFromMeetup(meetup.id)}
                          className="bg-orange-600 text-white hover:bg-orange-700"
                        >
                          Unregister
                        </Button>
                      )}
                      {meetup.status === 'Ongoing' && (
                        <Button
                          onClick={() => checkIn(meetup.id, false)}
                          className="border-2 border-red-500 bg-purple-600 text-white hover:bg-purple-700"
                        >
                          Check In
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Back Button */}
        <div className="flex justify-center">
          <Button
            onClick={() => onViewChange('home')}
            variant="outline"
            className="flex items-center gap-2 border-gray-300 text-gray-700 transition-colors hover:bg-gray-100"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </div>

        {/* End Meetup Confirmation Dialog */}
        {showEndConfirm.meetupId && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-gray-900">Confirm End Meetup</h3>
              <p className="mt-2 text-sm text-gray-600">
                Are you sure all attendees have checked in? Payment will only be made for checked-in
                attendees. Total payout: {(showEndConfirm.totalPaid / 1e18).toFixed(2)} SBY
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  onClick={() => setShowEndConfirm({ meetupId: null, totalPaid: 0 })}
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => confirmEndMeetup(showEndConfirm.meetupId!)}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  End Meetup
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
