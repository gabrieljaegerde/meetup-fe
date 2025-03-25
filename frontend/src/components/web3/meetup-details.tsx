'use client'

import { FC, useCallback, useEffect, useState } from 'react'

import { ContractIds } from '@/deployments/deployments'
import { u8aToHex } from '@polkadot/util'
// Add these for hex conversion
import { decodeAddress } from '@polkadot/util-crypto'
// Add this import
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
  title: string
  description: string
  location: string
  locationType: 'Online' | 'InPerson'
  timestamp: number
  price: string
  maxAttendees: number
  attendees: string[]
  status: 'Planned' | 'Ongoing' | 'Ended' | 'Cancelled'
  totalPaid: string
  host: string
}

interface MeetupDetailsProps {
  meetupId: number
  onViewChange: (view: 'home' | 'create' | { details: number }) => void
  onRefetch?: (refetch: () => Promise<void>) => void
}

export const MeetupDetails: FC<MeetupDetailsProps> = ({ meetupId, onViewChange, onRefetch }) => {
  const { api, activeAccount } = useInkathon()
  const { contract } = useRegisteredContract(ContractIds.Meetup)
  const [meetup, setMeetup] = useState<Meetup | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isRegistering, setIsRegistering] = useState<boolean>(false)

  const fetchMeetupDetails = useCallback(async (): Promise<void> => {
    if (!contract || !api) return

    setIsLoading(true)
    try {
      const result = await contractQuery(api, '', contract, 'get_meetup', {}, [meetupId])
      const { output, isError, decodedOutput } = decodeOutput(result, contract, 'get_meetup')
      if (isError) throw new Error(decodedOutput || 'Unknown contract error')

      if (!output) {
        throw new Error('Meetup not found')
      }

      const meetupData = output

      const statusKey = Object.keys(meetupData.status)[0]
      const validStatuses = ['Planned', 'Ongoing', 'Ended', 'Cancelled']
      const decodedStatus = validStatuses.includes(statusKey) ? statusKey : 'Planned'

      const decodedMeetup: Meetup = {
        title: meetupData.title,
        description: meetupData.description,
        location: meetupData.location,
        locationType: meetupData.locationType === 'Online' ? 'Online' : 'InPerson',
        timestamp: parseInt(meetupData.timestamp.replace(/,/g, ''), 10),
        price: meetupData.price,
        maxAttendees: parseInt(meetupData.maxAttendees, 10),
        attendees: meetupData.attendees.map((attendee: any) => attendee.toString()),
        status: decodedStatus as 'Planned' | 'Ongoing' | 'Ended' | 'Cancelled',
        totalPaid: meetupData.totalPaid,
        host: meetupData.host.toString(),
      }

      console.log('Decoded meetup:', decodedMeetup)
      console.log('Active account address:', activeAccount?.address)
      console.log('Attendees list:', decodedMeetup.attendees)

      // Log decoded public keys for debugging
      if (activeAccount) {
        const activePubKey = u8aToHex(decodeAddress(activeAccount.address))
        console.log('Active account public key (hex):', activePubKey)
        console.log(
          'Attendees public keys (hex):',
          decodedMeetup.attendees.map((addr) => u8aToHex(decodeAddress(addr))),
        )
      }

      setMeetup(decodedMeetup)
    } catch (e) {
      console.error('Error fetching meetup details:', e)
      toast.error('Error while fetching meetup details. Try again…')
      setMeetup(null)
    } finally {
      setIsLoading(false)
    }
  }, [api, contract, meetupId, activeAccount])

  const registerForMeetup = useCallback(async () => {
    if (!contract || !api || !activeAccount || !meetup) return

    setIsRegistering(true)
    try {
      const priceInWei = BigInt(meetup.price.replace(/,/g, ''))
      const depositInWei = BigInt('1000000000000000000') // 1 SBY = 10^18 wei
      const totalPayment = priceInWei + depositInWei

      await contractTx(
        api,
        activeAccount.address,
        contract,
        'register_for_meetup',
        { value: totalPayment },
        [meetupId],
      )

      toast.success('Successfully registered for meetup!')
      await new Promise((resolve) => setTimeout(resolve, 2000)) // Wait 2 seconds
      await fetchMeetupDetails()
    } catch (e) {
      console.error('Error registering for meetup:', e)
      toast.error('Error while registering. Try again…')
    } finally {
      setIsRegistering(false)
    }
  }, [api, activeAccount, contract, meetupId, meetup, fetchMeetupDetails])

  useEffect(() => {
    fetchMeetupDetails()
  }, [fetchMeetupDetails])

  useEffect(() => {
    if (onRefetch) {
      onRefetch(fetchMeetupDetails)
    }
  }, [onRefetch, fetchMeetupDetails])

  const handleBack = () => {
    onViewChange('home')
  }

  if (!api) return <div>Loading API...</div>
  if (isLoading) return <div>Loading meetup details…</div>
  if (!meetup) return <div>Meetup not found.</div>

  const priceInSBY = Number(meetup.price.replace(/,/g, '')) / 1e18
  const totalPaidInSBY = Number(meetup.totalPaid.replace(/,/g, '')) / 1e18

  // Normalize addresses by comparing public keys
  const isUserRegistered =
    activeAccount &&
    meetup.attendees.some(
      (attendee) =>
        u8aToHex(decodeAddress(attendee)) === u8aToHex(decodeAddress(activeAccount.address)),
    )

  console.log('canRegister conditions:', {
    status: meetup.status,
    isPlanned: meetup.status === 'Planned',
    attendeesCount: meetup.attendees.length,
    maxAttendees: meetup.maxAttendees,
    isUserRegistered,
    isHost:
      activeAccount &&
      u8aToHex(decodeAddress(meetup.host)) === u8aToHex(decodeAddress(activeAccount.address)),
    hasActiveAccount: !!activeAccount,
  })

  const canRegister =
    activeAccount &&
    meetup.status === 'Planned' &&
    meetup.attendees.length < meetup.maxAttendees &&
    !isUserRegistered &&
    activeAccount &&
    u8aToHex(decodeAddress(meetup.host)) !== u8aToHex(decodeAddress(activeAccount.address))

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <h2 className="text-center font-mono text-2xl text-gray-800">Meetup Details</h2>
      <div className="w-full max-w-2xl">
        <h3 className="text-lg font-semibold">{meetup.title}</h3>
        <p className="text-sm text-gray-600">Description: {meetup.description}</p>
        <p className="text-sm text-gray-600">
          {meetup.locationType}: {meetup.location}
        </p>
        <p className="text-sm text-gray-600">Date: {new Date(meetup.timestamp).toLocaleString()}</p>
        <p className="text-sm text-gray-600">Price: {priceInSBY.toFixed(2)} SBY</p>
        <p className="text-sm text-gray-600">
          Attendees: {meetup.attendees.length}/{meetup.maxAttendees}
        </p>
        <p className="text-sm text-gray-600">Status: {meetup.status}</p>
        <p className="text-sm text-gray-600">Host: {meetup.host}</p>
        <p className="text-sm text-gray-600">Total Paid: {totalPaidInSBY.toFixed(2)} SBY</p>
        <p className="text-sm text-gray-600">
          Registration Cost: {(priceInSBY + 1).toFixed(2)} SBY (includes 1 SBY deposit)
        </p>
        {activeAccount && (
          <p className="text-sm text-gray-600">
            Your Address: {activeAccount.address.slice(0, 6)}...{activeAccount.address.slice(-4)}
          </p>
        )}
        {meetup.attendees.length > 0 && (
          <p className="text-sm text-gray-600">
            Registered Attendees:{' '}
            {meetup.attendees.map((addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`).join(', ')}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <Button onClick={handleBack} className="bg-gray-500 text-white">
            Back to Home
          </Button>
          {activeAccount && canRegister && (
            <Button
              onClick={registerForMeetup}
              disabled={isRegistering}
              className="bg-blue-500 text-white"
            >
              {isRegistering ? 'Registering...' : 'Register'}
            </Button>
          )}
          {isUserRegistered && (
            <p className="self-center text-sm text-green-600">You are registered!</p>
          )}
        </div>
      </div>
    </div>
  )
}
