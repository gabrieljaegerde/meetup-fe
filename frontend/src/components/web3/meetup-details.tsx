'use client'

import dynamic from 'next/dynamic'
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
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
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

interface MeetupDetailsProps {
  meetupId: number
  onViewChange: (view: 'home' | 'create' | { details: number }) => void
  onRefetch?: (refetch: () => Promise<void>) => void
}

// Dynamic imports for Leaflet components
const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), {
  ssr: false,
})
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), {
  ssr: false,
})
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then((mod) => mod.Popup), { ssr: false })

// Custom Leaflet icon matching MeetupMap
const meetupIcon = new L.Icon({
  iconUrl: 'https://leafletjs.com/examples/custom-icons/leaf-red.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

export const MeetupDetails: FC<MeetupDetailsProps> = ({ meetupId, onViewChange, onRefetch }) => {
  const { api, activeAccount } = useInkathon()
  const { contract } = useRegisteredContract(ContractIds.Meetup)
  const [meetup, setMeetup] = useState<Meetup | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isRegistering, setIsRegistering] = useState<boolean>(false)
  const [isUnregistering, setIsUnregistering] = useState<boolean>(false)

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

      const status = meetupData.status as 'Planned' | 'Ongoing' | 'Ended' | 'Cancelled'

      const decodedMeetup: Meetup = {
        id: meetupId,
        title: meetupData.title,
        description: meetupData.description,
        location: meetupData.location,
        locationType: meetupData.locationType === 'Online' ? 'Online' : 'InPerson',
        timestamp: parseInt(meetupData.timestamp.replace(/,/g, ''), 10),
        price: meetupData.price,
        maxAttendees: parseInt(meetupData.maxAttendees, 10),
        attendees: meetupData.attendees.map((attendee: any) => attendee.toString()),
        status,
        totalPaid: meetupData.totalPaid,
        host: meetupData.host.toString(),
        timezone: meetupData.timezone,
      }

      console.log('Decoded meetup:', decodedMeetup)
      console.log('Active account address:', activeAccount?.address)
      console.log('Attendees list:', decodedMeetup.attendees)

      if (activeAccount) {
        const activePubKey = u8aToHex(decodeAddress(activeAccount.address))
        console.log('Active account public key (hex):', activePubKey)
        console.log(
          'Attendees public keys (hex):',
          decodedMeetup.attendees.map((addr) => u8aToHex(decodeAddress(addr))),
        )
      }

      setMeetup(decodedMeetup)
    } catch (e: unknown) {
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
      const priceInWei = BigInt(meetup.price.toString().replace(/,/g, ''))
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
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await fetchMeetupDetails()
    } catch (e: unknown) {
      console.error('Error registering for meetup:', e)
      toast.error('Error while registering. Try again…')
    } finally {
      setIsRegistering(false)
    }
  }, [api, activeAccount, contract, meetupId, meetup, fetchMeetupDetails])

  const unregisterFromMeetup = useCallback(async () => {
    if (!contract || !api || !activeAccount || !meetup) return

    setIsUnregistering(true)
    try {
      await contractTx(
        api,
        activeAccount.address,
        contract,
        'unregister_from_meetup',
        {}, // No value sent, as it's not payable
        [meetupId],
      )

      toast.success('Successfully unregistered from meetup!')
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await fetchMeetupDetails()
    } catch (e: unknown) {
      console.error('Error unregistering from meetup:', e)
      const error = e as Error
      if (error.message === 'AlreadyCheckedIn') {
        toast.error('Cannot unregister: You have already checked in.')
      } else if (error.message === 'InvalidStatus') {
        toast.error('Cannot unregister: Meetup is no longer in Planned status.')
      } else if (error.message === 'NotRegistered') {
        toast.error('You are not registered for this meetup.')
      } else {
        toast.error('Error while unregistering. Try again…')
      }
    } finally {
      setIsUnregistering(false)
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

  // Parse location for map (latitude,longitude)
  const getLocationCoords = (location: string): [number, number] | null => {
    const [latStr, lonStr] = location.split(',')
    const lat = parseFloat(latStr)
    const lon = parseFloat(lonStr)
    return !isNaN(lat) && !isNaN(lon) ? [lat, lon] : null
  }

  if (!api) return <div>Loading API...</div>
  if (isLoading) return <div>Loading meetup details…</div>
  if (!meetup) return <div>Meetup not found.</div>

  const priceInSBY = Number(meetup.price.toString().replace(/,/g, '')) / 1e18
  const totalPaidInSBY = Number(meetup.totalPaid.toString().replace(/,/g, '')) / 1e18

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

  const locationCoords =
    meetup.locationType === 'InPerson' ? getLocationCoords(meetup.location) : null

  // Determine the timezone to use based on locationType
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone // User's local timezone
  const displayTimezone = meetup.locationType === 'Online' ? userTimezone : meetup.timezone

  // Format date based on the determined timezone
  const formattedDate = new Date(meetup.timestamp).toLocaleString('en-US', {
    timeZone: displayTimezone,
    dateStyle: 'full',
    timeStyle: 'short',
  })

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <h2 className="text-center font-mono text-2xl text-gray-800">Meetup Details</h2>
      <div className="w-full max-w-2xl">
        <h3 className="text-lg font-semibold">{meetup.title}</h3>
        <p className="text-sm text-gray-600">Description: {meetup.description}</p>
        <p className="text-sm text-gray-600">
          {meetup.locationType}: {meetup.location}
        </p>
        {meetup.locationType === 'InPerson' && locationCoords && (
          <div className="mt-4 h-[300px] w-full overflow-hidden rounded-lg shadow-lg">
            <MapContainer
              center={locationCoords}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
              zoomControl={true}
              attributionControl={false}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              <Marker position={locationCoords} icon={meetupIcon}>
                <Popup>
                  <div className="p-2">
                    <h3 className="text-lg font-bold">{meetup.title}</h3>
                    <p className="text-sm">Date: {formattedDate}</p>
                    <p className="text-sm">
                      Coordinates: {locationCoords[0]}, {locationCoords[1]}
                    </p>
                  </div>
                </Popup>
              </Marker>
            </MapContainer>
          </div>
        )}
        <p className="text-sm text-gray-600">
          Date: {formattedDate} ({displayTimezone})
        </p>
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
          {activeAccount && isUserRegistered && meetup.status === 'Planned' && (
            <Button
              onClick={unregisterFromMeetup}
              disabled={isUnregistering}
              className="bg-red-500 text-white"
            >
              {isUnregistering ? 'Unregistering...' : 'Unregister'}
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
