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
import { motion } from 'framer-motion'
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
  timezone: string
}

interface MeetupDetailsProps {
  meetupId: number
  onViewChange: (view: 'home' | 'create' | { details: number }) => void
  onRefetch?: (refetch: () => Promise<void>) => void
}

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), {
  ssr: false,
})
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), {
  ssr: false,
})
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then((mod) => mod.Popup), { ssr: false })

const meetupIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/149/149060.png',
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
})

export const MeetupDetails: FC<MeetupDetailsProps> = ({ meetupId, onViewChange, onRefetch }) => {
  const { api, activeAccount } = useInkathon()
  const { contract } = useRegisteredContract(ContractIds.Meetup)
  const [meetup, setMeetup] = useState<Meetup | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isRegistering, setIsRegistering] = useState<boolean>(false)
  const [isUnregistering, setIsUnregistering] = useState<boolean>(false)
  const [address, setAddress] = useState<string | null>(null)

  const fetchMeetupDetails = useCallback(async (): Promise<void> => {
    if (!contract || !api) return
    setIsLoading(true)
    try {
      const result = await contractQuery(api, '', contract, 'get_meetup', {}, [meetupId])
      const { output, isError, decodedOutput } = decodeOutput(result, contract, 'get_meetup')
      if (isError) throw new Error(decodedOutput || 'Unknown contract error')
      if (!output) throw new Error('Meetup not found')

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
      setMeetup(decodedMeetup)

      if (decodedMeetup.locationType === 'InPerson') {
        const coords = getLocationCoords(decodedMeetup.location)
        if (coords) {
          const fetchedAddress = await fetchAddress(coords[0], coords[1])
          setAddress(fetchedAddress)
        }
      }
    } catch (e: unknown) {
      console.error('Error fetching meetup details:', e)
      toast.error('Error while fetching meetup details. Try again…')
      setMeetup(null)
    } finally {
      setIsLoading(false)
    }
  }, [api, contract, meetupId])

  const fetchAddress = async (lat: number, lon: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      )
      const data = await response.json()
      return data.display_name || 'Address not found'
    } catch (e) {
      console.error('Error fetching address:', e)
      return 'Unable to fetch address'
    }
  }

  const registerForMeetup = useCallback(async () => {
    if (!contract || !api || !activeAccount || !meetup) return
    setIsRegistering(true)
    try {
      const priceInWei = BigInt(meetup.price.toString().replace(/,/g, ''))
      const depositInWei = BigInt('1000000000000000000')
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
      await contractTx(api, activeAccount.address, contract, 'unregister_from_meetup', {}, [
        meetupId,
      ])
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
    if (onRefetch) onRefetch(fetchMeetupDetails)
  }, [onRefetch, fetchMeetupDetails])

  const handleBack = () => onViewChange('home')

  const getLocationCoords = (location: string): [number, number] | null => {
    const [latStr, lonStr] = location.split(',')
    const lat = parseFloat(latStr)
    const lon = parseFloat(lonStr)
    return !isNaN(lat) && !isNaN(lon) ? [lat, lon] : null
  }

  if (!api)
    return (
      <div className="flex h-screen items-center justify-center text-gray-600">Loading API...</div>
    )
  if (isLoading)
    return (
      <div className="flex h-screen items-center justify-center">
        <motion.div
          className="h-[400px] w-[400px] animate-pulse rounded-2xl bg-gradient-to-br from-gray-100 to-gray-300 shadow-xl"
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
        />
      </div>
    )
  if (!meetup)
    return (
      <div className="flex h-screen items-center justify-center text-lg italic text-gray-600">
        Meetup not found.
      </div>
    )

  const priceInSBY = Number(meetup.price.toString().replace(/,/g, '')) / 1e18
  const isUserRegistered =
    activeAccount &&
    meetup.attendees.some(
      (attendee) =>
        u8aToHex(decodeAddress(attendee)) === u8aToHex(decodeAddress(activeAccount.address)),
    )
  const canRegister =
    activeAccount &&
    meetup.status === 'Planned' &&
    meetup.attendees.length < meetup.maxAttendees &&
    !isUserRegistered &&
    u8aToHex(decodeAddress(meetup.host)) !== u8aToHex(decodeAddress(activeAccount.address))
  const locationCoords =
    meetup.locationType === 'InPerson' ? getLocationCoords(meetup.location) : null
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const displayTimezone = meetup.locationType === 'Online' ? userTimezone : meetup.timezone
  const formattedDate = new Date(meetup.timestamp).toLocaleString('en-US', {
    timeZone: displayTimezone,
    dateStyle: 'full',
    timeStyle: 'short',
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
      className="mx-auto max-w-4xl p-8"
    >
      {/* Header with Gradient */}
      <motion.div
        className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 to-teal-600 p-6 shadow-xl"
        initial={{ y: -20 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-4xl font-extrabold text-white">{meetup.title}</h2>
        <p className="mt-2 text-lg text-teal-100">
          {formattedDate} ({displayTimezone})
        </p>
        <div className="absolute -bottom-4 -right-4 h-32 w-32 rounded-full bg-white opacity-10" />
      </motion.div>

      {/* Main Content */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Map or Location Banner */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="lg:col-span-2"
        >
          {meetup.locationType === 'InPerson' && locationCoords ? (
            <div className="space-y-4">
              <div className="relative h-[450px] w-full overflow-hidden rounded-2xl border border-gray-200 shadow-xl">
                <MapContainer
                  center={locationCoords}
                  zoom={14}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={true}
                  attributionControl={false}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  />
                  <Marker position={locationCoords} icon={meetupIcon}>
                    <Popup>
                      <div className="p-3">
                        <h3 className="text-lg font-bold text-teal-800">{meetup.title}</h3>
                        <p className="text-sm text-gray-600">{formattedDate}</p>
                        <p className="text-sm text-gray-600">{address || 'Fetching address...'}</p>
                        <p className="text-sm text-gray-600">
                          Coordinates: {locationCoords[0].toFixed(4)},{' '}
                          {locationCoords[1].toFixed(4)}
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                </MapContainer>
              </div>
              {address && (
                <div className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800">
                  <p>
                    <span className="font-semibold">Address:</span> {address}
                  </p>
                  <p>
                    <span className="font-semibold">Coordinates:</span>{' '}
                    {locationCoords[0].toFixed(4)}, {locationCoords[1].toFixed(4)}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-[200px] items-center justify-center rounded-2xl bg-gradient-to-br from-teal-100 to-indigo-100 shadow-md">
              <p className="text-xl font-semibold text-teal-800">
                Online Meetup •{' '}
                <a href={meetup.location} className="underline hover:text-teal-600">
                  {meetup.location}
                </a>
              </p>
            </div>
          )}
        </motion.div>

        {/* Details Card */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl lg:col-span-1"
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-indigo-800">Description</p>
              <p className="mt-1 max-h-48 overflow-y-auto leading-relaxed text-gray-700">
                {meetup.description}
              </p>
            </div>
            <p className="text-gray-700">
              <span className="font-semibold text-indigo-800">Price:</span>{' '}
              <span className="text-teal-600">{priceInSBY.toFixed(2)} SBY</span>{' '}
              <span className="text-sm text-gray-500">(+1 SBY deposit)</span>
            </p>
            <p className="text-gray-700">
              <span className="font-semibold text-indigo-800">Attendees:</span>{' '}
              <span className="rounded-full bg-teal-100 px-2 py-1 text-sm text-teal-800">
                {meetup.attendees.length}/{meetup.maxAttendees}
              </span>
            </p>
            <p className="text-gray-700">
              <span className="font-semibold text-indigo-800">Status:</span>{' '}
              <span
                className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${
                  meetup.status === 'Planned'
                    ? 'bg-green-100 text-green-800'
                    : meetup.status === 'Ongoing'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-800'
                }`}
              >
                {meetup.status}
              </span>
            </p>
            <p className="text-gray-700">
              <span className="font-semibold text-indigo-800">Host:</span> {meetup.host.slice(0, 6)}
              ...{meetup.host.slice(-4)}
            </p>
            {meetup.attendees.length > 0 && (
              <p className="text-gray-700">
                <span className="font-semibold text-indigo-800">Attendees:</span>{' '}
                <span className="text-sm">
                  {meetup.attendees
                    .map((addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`)
                    .join(', ')}
                </span>
              </p>
            )}
          </div>
        </motion.div>
      </div>

      {/* Actions */}
      <motion.div
        className="mt-8 flex flex-wrap gap-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        <Button
          onClick={handleBack}
          className="rounded-lg bg-gradient-to-r from-gray-500 to-gray-600 px-6 py-3 text-white shadow-lg transition-transform hover:scale-105 hover:from-gray-600 hover:to-gray-700"
        >
          Back to Home
        </Button>
        {activeAccount && canRegister && (
          <Button
            onClick={registerForMeetup}
            disabled={isRegistering}
            className="rounded-lg bg-gradient-to-r from-teal-600 to-teal-700 px-6 py-3 text-white shadow-lg transition-transform hover:scale-105 hover:from-teal-700 hover:to-teal-800"
          >
            {isRegistering ? 'Registering...' : 'Register Now'}
          </Button>
        )}
        {activeAccount && isUserRegistered && meetup.status === 'Planned' && (
          <Button
            onClick={unregisterFromMeetup}
            disabled={isUnregistering}
            className="rounded-lg bg-gradient-to-r from-red-500 to-red-600 px-6 py-3 text-white shadow-lg transition-transform hover:scale-105 hover:from-red-600 hover:to-red-700"
          >
            {isUnregistering ? 'Unregistering...' : 'Unregister'}
          </Button>
        )}
        {isUserRegistered && (
          <motion.div
            className="flex items-center rounded-full bg-green-100 px-4 py-2 shadow-md"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 300 }}
          >
            <span className="text-sm font-medium text-green-800">Registered!</span>
            <motion.span
              className="ml-2 h-2 w-2 rounded-full bg-green-500"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  )
}
