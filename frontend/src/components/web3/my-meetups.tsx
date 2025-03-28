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
  timezone: string // New field
}

interface MyMeetupsProps {
  onViewChange: (view: 'home' | 'create' | { details: number }) => void
}

export const MyMeetups: FC<MyMeetupsProps> = ({ onViewChange }) => {
  const { api, activeAccount } = useInkathon()
  const { contract } = useRegisteredContract(ContractIds.Meetup)
  const [hostedMeetups, setHostedMeetups] = useState<[number, Meetup][]>([])
  const [attendingMeetups, setAttendingMeetups] = useState<[number, Meetup][]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [reputation, setReputation] = useState<number>(0)
  const [selectedAttendees, setSelectedAttendees] = useState<{ [meetupId: number]: string }>({})

  const fetchMyMeetups = useCallback(async () => {
    if (!contract || !api || !activeAccount) {
      console.log(
        'Missing dependencies: contract=',
        contract,
        'api=',
        api,
        'activeAccount=',
        activeAccount,
      )
      return
    }

    setIsLoading(true)
    try {
      console.log('Fetching all meetups...')
      const result = await contractQuery(api, '', contract, 'get_all_meetups', {}, [false])
      const { output, isError, decodedOutput } = decodeOutput(result, contract, 'get_all_meetups')
      console.log('Raw get_all_meetups output:', output)
      if (isError) throw new Error(decodedOutput)

      const meetups: [number, any][] = output || []
      console.log('Raw meetups array:', meetups)

      const decodedMeetups: [number, Meetup][] = meetups.map(([id, meetupData]) => {
        const status = meetupData.status as 'Planned' | 'Ongoing' | 'Ended' | 'Cancelled'
        console.log(`Meetup ${id} status: ${status}`)
        return [
          id,
          {
            title: meetupData.title,
            description: meetupData.description,
            location: meetupData.location,
            locationType: meetupData.locationType === 'Online' ? 'Online' : 'InPerson',
            timestamp: parseInt(meetupData.timestamp.replace(/,/g, ''), 10),
            price: meetupData.price,
            maxAttendees: parseInt(meetupData.maxAttendees, 10),
            attendees: meetupData.attendees.map((a: any) => a.toString()),
            status,
            totalPaid: meetupData.totalPaid,
            host: meetupData.host.toString(),
          },
        ]
      })

      const pubKey = u8aToHex(decodeAddress(activeAccount.address))
      console.log('Active account public key:', pubKey)
      const hosted = decodedMeetups.filter(([, m]) => u8aToHex(decodeAddress(m.host)) === pubKey)
      const attending = decodedMeetups.filter(([, m]) =>
        m.attendees.some((a) => u8aToHex(decodeAddress(a)) === pubKey),
      )
      console.log('Hosted meetups:', hosted)
      console.log('Attending meetups:', attending)

      setHostedMeetups(hosted)
      setAttendingMeetups(attending)

      const repResult = await contractQuery(api, '', contract, 'get_reputation_score', {}, [
        activeAccount.address,
      ])
      const { output: repOutput } = decodeOutput(repResult, contract, 'get_reputation_score')
      console.log('Reputation score:', repOutput)
      setReputation(repOutput || 0)
    } catch (e: unknown) {
      const error = e as Error
      console.error('Error fetching meetups:', error)
      toast.error(`Error fetching your meetups: ${error.message || 'Unknown error'}`)
    } finally {
      setIsLoading(false)
    }
  }, [api, contract, activeAccount])

  const updateStatus = useCallback(
    async (meetupId: number, newStatus: 'Ongoing' | 'Ended') => {
      if (!contract || !api || !activeAccount) return

      console.log(`Attempting to update status of meetup ${meetupId} to ${newStatus}`)
      try {
        const txResult = await contractTx(
          api,
          activeAccount.address,
          contract,
          'update_state',
          {},
          [meetupId, newStatus],
        )
        console.log('Update status tx result:', txResult)
        toast.success(`Status updated to ${newStatus}!`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await fetchMyMeetups()
      } catch (e: unknown) {
        const error = e as Error
        console.error('Error updating status:', error)
        toast.error(`Error updating status: ${error.message || 'Unknown error'}`)
      }
    },
    [api, activeAccount, contract, fetchMyMeetups],
  )

  const cancelMeetup = useCallback(
    async (meetupId: number) => {
      if (!contract || !api || !activeAccount) return

      console.log(`Attempting to cancel meetup ${meetupId}`)
      try {
        const txResult = await contractTx(
          api,
          activeAccount.address,
          contract,
          'cancel_meetup',
          {},
          [meetupId],
        )
        console.log('Cancel tx result:', txResult)
        toast.success('Meetup cancelled!')
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await fetchMyMeetups()
      } catch (e: unknown) {
        const error = e as Error
        console.error('Error cancelling meetup:', error)
        toast.error(`Error cancelling meetup: ${error.message || 'Unknown error'}`)
      }
    },
    [api, activeAccount, contract, fetchMyMeetups],
  )

  const distributeRevenue = useCallback(
    async (meetupId: number) => {
      if (!contract || !api || !activeAccount) return

      console.log(`Attempting to distribute revenue for meetup ${meetupId}`)
      try {
        const txResult = await contractTx(
          api,
          activeAccount.address,
          contract,
          'distribute_revenue',
          {},
          [meetupId],
        )
        console.log('Distribute revenue tx result:', txResult)
        toast.success('Revenue distributed!')
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await fetchMyMeetups()
      } catch (e: unknown) {
        const error = e as Error
        console.error('Error distributing revenue:', error)
        toast.error(`Error distributing revenue: ${error.message || 'Unknown error'}`)
      }
    },
    [api, activeAccount, contract, fetchMyMeetups],
  )

  const checkIn = useCallback(
    async (meetupId: number, asHost: boolean, attendeeAddress?: string) => {
      if (!contract || !api || !activeAccount) return

      const targetAddress = asHost
        ? attendeeAddress || activeAccount.address
        : activeAccount.address
      console.log(
        `Attempting to check in for meetup ${meetupId} as ${asHost ? 'host' : 'attendee'} for ${targetAddress}`,
      )
      try {
        const txResult = await contractTx(api, activeAccount.address, contract, 'check_in', {}, [
          meetupId,
          targetAddress,
        ])
        console.log('Check-in tx result:', txResult)
        toast.success('Checked in successfully!')
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await fetchMyMeetups()
      } catch (e: unknown) {
        const error = e as Error
        console.error('Error checking in:', error)
        toast.error(`Error checking in: ${error.message || 'Unknown error'}`)
      }
    },
    [api, activeAccount, contract, fetchMyMeetups],
  )

  useEffect(() => {
    console.log('Triggering fetchMyMeetups...')
    fetchMyMeetups()
  }, [fetchMyMeetups])

  if (!api || !activeAccount) {
    console.log('Rendering wallet connect prompt')
    return <div>Please connect your wallet...</div>
  }
  if (isLoading) {
    console.log('Rendering loading state')
    return <div>Loading your meetups…</div>
  }

  console.log('Rendering meetups with hosted:', hostedMeetups, 'attending:', attendingMeetups)

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <h2 className="text-center font-mono text-2xl text-gray-800">My Meetups</h2>
      <p className="text-sm text-gray-600">Reputation Score: {reputation}</p>

      {/* Hosted Meetups */}
      <div className="w-full max-w-2xl">
        <h3 className="text-lg font-semibold">Hosted Meetups</h3>
        {hostedMeetups.length === 0 ? (
          <p className="text-sm text-gray-600">You are not hosting any meetups.</p>
        ) : (
          hostedMeetups.map(([id, meetup]) => {
            console.log(`Rendering hosted meetup ${id} with status: ${meetup.status}`)
            return (
              <div key={id} className="mb-4 rounded border p-4">
                <h4 className="font-medium">{meetup.title}</h4>
                <p className="text-sm text-gray-600">Status: {meetup.status}</p>
                <p className="text-sm text-gray-600">
                  Date: {new Date(meetup.timestamp).toLocaleString()}
                </p>
                <p className="text-sm text-gray-600">
                  Attendees: {meetup.attendees.length}/{meetup.maxAttendees}
                </p>
                <p className="text-sm text-gray-600">
                  Total Paid: {(Number(meetup.totalPaid.replace(/,/g, '')) / 1e18).toFixed(2)} SBY
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    onClick={() => onViewChange({ details: id })}
                    className="bg-blue-500 text-white"
                  >
                    View Details
                  </Button>
                  {meetup.status === 'Planned' && (
                    <>
                      <Button
                        onClick={() => updateStatus(id, 'Ongoing')}
                        className="bg-green-500 text-white"
                      >
                        Start Meetup
                      </Button>
                      <Button onClick={() => cancelMeetup(id)} className="bg-red-500 text-white">
                        Cancel
                      </Button>
                    </>
                  )}
                  {meetup.status === 'Ongoing' && (
                    <>
                      <Button
                        onClick={() => updateStatus(id, 'Ended')}
                        className="bg-yellow-500 text-white"
                      >
                        End Meetup
                      </Button>
                      <select
                        value={selectedAttendees[id] || ''}
                        onChange={(e) =>
                          setSelectedAttendees({ ...selectedAttendees, [id]: e.target.value })
                        }
                        className="rounded border p-1 text-sm"
                      >
                        <option value="">Select Attendee</option>
                        {meetup.attendees.map((attendee) => (
                          <option key={attendee} value={attendee}>
                            {attendee.slice(0, 6)}...{attendee.slice(-4)}
                          </option>
                        ))}
                      </select>
                      <Button
                        onClick={() => checkIn(id, true, selectedAttendees[id])}
                        disabled={!selectedAttendees[id]}
                        className="bg-purple-500 text-white"
                      >
                        Check In Attendee
                      </Button>
                    </>
                  )}
                  {meetup.status === 'Ended' && (
                    <Button
                      onClick={() => distributeRevenue(id)}
                      className="bg-green-500 text-white"
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

      {/* Attending Meetups */}
      <div className="w-full max-w-2xl">
        <h3 className="text-lg font-semibold">Attending Meetups</h3>
        {attendingMeetups.length === 0 ? (
          <p className="text-sm text-gray-600">You are not registered for any meetups.</p>
        ) : (
          attendingMeetups.map(([id, meetup]) => {
            console.log(`Rendering attending meetup ${id} with status: ${meetup.status}`)
            return (
              <div key={id} className="mb-4 rounded border p-4">
                <h4 className="font-medium">{meetup.title}</h4>
                <p className="text-sm text-gray-600">Status: {meetup.status}</p>
                <p className="text-sm text-gray-600">
                  Date: {new Date(meetup.timestamp).toLocaleString()}
                </p>
                <p className="text-sm text-gray-600">Host: {meetup.host}</p>
                <div className="mt-2 flex gap-2">
                  <Button
                    onClick={() => onViewChange({ details: id })}
                    className="bg-blue-500 text-white"
                  >
                    View Details
                  </Button>
                  {meetup.status === 'Ongoing' && (
                    <Button onClick={() => checkIn(id, false)} className="bg-purple-500 text-white">
                      Check In
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <Button onClick={() => onViewChange('home')} className="bg-gray-500 text-white">
        Back to Home
      </Button>
    </div>
  )
}
