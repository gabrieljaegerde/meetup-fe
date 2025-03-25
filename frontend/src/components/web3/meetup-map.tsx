'use client'

import dynamic from 'next/dynamic'
import { FC, useCallback, useEffect, useMemo, useState } from 'react'

import { ContractIds } from '@/deployments/deployments'
import {
  contractQuery,
  decodeOutput,
  useInkathon,
  useRegisteredContract,
} from '@scio-labs/use-inkathon'
import L from 'leaflet'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'

// Meetup interface
interface Meetup {
  id: number
  title: string
  location: string
  locationType: 'Online' | 'InPerson'
  timestamp: number
}

interface MeetupMapProps {
  onViewChange: (view: { details: number }) => void
  onRefetch?: (refetch: () => Promise<void>) => void // Correctly typed to receive a no-arg async function
}

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] w-full items-center justify-center rounded-lg bg-gray-100">
      Loading map...
    </div>
  ),
})
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), {
  ssr: false,
})
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then((mod) => mod.Popup), { ssr: false })

const meetupIcon = new L.Icon({
  iconUrl: 'https://leafletjs.com/examples/custom-icons/leaf-red.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

const MapErrorBoundary: FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasError, setHasError] = useState<string | null>(null)

  useEffect(() => {
    const errorHandler = (e: ErrorEvent) => {
      console.error('Map error caught:', e.message, e.error?.stack)
      setHasError(e.message)
    }
    window.addEventListener('error', errorHandler)
    return () => window.removeEventListener('error', errorHandler)
  }, [])

  if (hasError) {
    return (
      <div className="flex h-[500px] w-full items-center justify-center rounded-lg bg-red-100">
        <p className="text-red-600">Map Error: {hasError}</p>
      </div>
    )
  }
  return <>{children}</>
}

export const MeetupMap: FC<MeetupMapProps> = ({ onViewChange, onRefetch }) => {
  const { api } = useInkathon()
  const { contract } = useRegisteredContract(ContractIds.Meetup)
  const [meetups, setMeetups] = useState<Meetup[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isMounted, setIsMounted] = useState<boolean>(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsMounted(true)
    }
  }, [])

  const parseLocation = (location: string): { lat: number; lng: number } | null => {
    if (!location || location.includes('|')) {
      console.warn(`Location invalid or in old format: "${location}"`)
      return null
    }
    try {
      console.log(`Parsing location: "${location}"`)
      const [lat, lng] = location.split(',').map(Number)
      if (isNaN(lat) || isNaN(lng)) {
        console.warn(`Invalid coordinates in location: "${location}"`)
        return null
      }
      return { lat, lng }
    } catch (e) {
      console.warn(`Error parsing location: "${location}"`, e)
      return null
    }
  }

  const fetchMeetups = useCallback(async (): Promise<void> => {
    if (!contract || !api) return

    setIsLoading(true)
    try {
      const result = await contractQuery(api, '', contract, 'get_all_meetups', {}, [true])
      const { output, isError, decodedOutput } = decodeOutput(result, contract, 'get_all_meetups')

      if (isError) throw new Error(decodedOutput || 'Unknown contract error')

      const meetupsData = output || []
      console.log('Raw meetups data from contract:', meetupsData)

      const results = meetupsData.map(([id, meetup]: [number, any]) => {
        const locationType = meetup.locationType === 'Online' ? 'Online' : 'InPerson'
        const locationStr = meetup.location
        const titleStr = meetup.title

        console.log(`Meetup ${id}:`, {
          title: titleStr,
          location: locationStr,
          locationType,
          timestamp: meetup.timestamp,
        })

        return {
          id,
          title: titleStr,
          location: locationStr,
          locationType,
          timestamp: parseInt(meetup.timestamp.replace(/,/g, '')),
        }
      })

      const inPersonMeetups = results.filter(
        (meetup: { locationType: string; location: string; id: any }) => {
          if (meetup.locationType === 'InPerson') {
            const parsed = parseLocation(meetup.location)
            if (!parsed) {
              console.warn(
                `Skipping meetup ${meetup.id} due to invalid location: "${meetup.location}"`,
              )
              return false
            }
            return true
          }
          return false
        },
      )

      console.log('Processed in-person meetups:', inPersonMeetups)
      setMeetups(inPersonMeetups)
    } catch (e: any) {
      console.error('Fetch error:', e.message, e.stack)
      toast.error('Failed to load meetups')
      setMeetups([])
    } finally {
      setIsLoading(false)
    }
  }, [api, contract])

  useEffect(() => {
    if (isMounted) {
      fetchMeetups()
    }
  }, [isMounted, fetchMeetups])

  const initialCenter: [number, number] = useMemo(() => {
    if (meetups.length > 0) {
      const firstValidLocation = meetups
        .map((m) => parseLocation(m.location))
        .find((loc) => loc !== null)
      return firstValidLocation ? [firstValidLocation.lat, firstValidLocation.lng] : [20, 0]
    }
    return [20, 0]
  }, [meetups])

  // Pass refetch function to parent
  useEffect(() => {
    if (onRefetch) {
      onRefetch(fetchMeetups) // Pass the function directly
    }
  }, [onRefetch, fetchMeetups])

  if (!isMounted) return null

  if (isLoading || !api || !contract) {
    return (
      <div className="flex h-[500px] w-full items-center justify-center rounded-lg bg-gray-100">
        <p className="text-gray-600">Loading map...</p>
      </div>
    )
  }

  return (
    <MapErrorBoundary>
      <div className="h-[500px] w-full overflow-hidden rounded-lg shadow-lg">
        <MapContainer
          center={initialCenter}
          zoom={meetups.length > 0 ? 10 : 2}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {meetups.map((meetup) => {
            const parsed = parseLocation(meetup.location)
            if (!parsed) return null

            const { lat, lng } = parsed
            console.log(`Rendering marker for Meetup ${meetup.id} at ${lat}, ${lng}`)
            return (
              <Marker key={meetup.id} position={[lat, lng]} icon={meetupIcon}>
                <Popup>
                  <div className="p-2">
                    <h3 className="text-lg font-bold">{meetup.title}</h3>
                    <p className="text-sm">Date: {new Date(meetup.timestamp).toLocaleString()}</p>
                    <p className="text-sm">
                      Coordinates: {lat}, {lng}
                    </p>
                    <Button
                      onClick={() => onViewChange({ details: meetup.id })}
                      className="mt-2 rounded-md bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600"
                    >
                      View Details
                    </Button>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>
      {meetups.length === 0 && (
        <p className="mt-2 text-center text-sm text-gray-600">
          No in-person meetups found to display on the map.
        </p>
      )}
    </MapErrorBoundary>
  )
}
