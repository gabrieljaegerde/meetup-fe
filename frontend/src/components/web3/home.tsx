'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useInkathon } from '@scio-labs/use-inkathon'
import { motion, useScroll, useTransform } from 'framer-motion'
import L, { MarkerCluster } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import MarkerClusterGroup from 'react-leaflet-cluster'

import { MeetupCard } from '@/components/ui/meetup-card'
import { getUserLocation } from '@/lib/geolocation'
import { calculateDistance } from '@/lib/meetup-utils'
import { Coordinates, Meetup } from '@/types/meetup'

// Dynamic imports for react-leaflet components
const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), {
  ssr: false,
})
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), {
  ssr: false,
})
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then((mod) => mod.Popup), { ssr: false })

// Custom marker icon
const meetupIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/149/149060.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
})

// Custom cluster icon
const createClusterIcon = (cluster: MarkerCluster) => {
  const count = cluster.getChildCount()
  return new L.DivIcon({
    html: `<div class="bg-teal-600 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold">${count}</div>`,
    className: 'custom-cluster-icon',
    iconSize: [40, 40],
  })
}

interface HomeProps {
  meetups: Meetup[]
  onViewChange: (view: 'home' | 'create' | { details: number }) => void
  showMapOnly?: boolean
  fetchIsLoading?: boolean
}

export const Home = ({
  meetups,
  onViewChange,
  showMapOnly = false,
  fetchIsLoading = false,
}: HomeProps) => {
  const { api } = useInkathon()
  const [decimals, setDecimals] = useState<number>(12)
  const [tokenSymbol, setTokenSymbol] = useState<string>('DOT')
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [userTimezone] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [currentTime, setCurrentTime] = useState<number>(Date.now())
  const [isMounted, setIsMounted] = useState(false)
  const [initialMapCenter, setInitialMapCenter] = useState<[number, number]>([20, 0])
  const onlineRef = useRef<HTMLDivElement>(null)
  const inPersonRef = useRef<HTMLDivElement>(null)

  const { scrollY } = useScroll()
  const onlineOpacity = useTransform(scrollY, [0, 200], [1, 0.5])
  const inPersonTop = useTransform(scrollY, [0, 64], [80, 16])

  useEffect(() => {
    setIsMounted(true)
    getUserLocation()
      .then((coords) => setUserLocation({ latitude: coords.latitude, longitude: coords.longitude }))
      .catch(() => setLocationError('Unable to fetch location. Sorting by date.'))
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const fetchChainInfo = async () => {
      if (!api) return
      const chainDecimals = api.registry.chainDecimals[0] || 12
      setDecimals(chainDecimals)
      const symbol = (await api.rpc.system.properties()).tokenSymbol.unwrapOr(['DOT'])[0].toString()
      setTokenSymbol(symbol)
    }
    fetchChainInfo()
  }, [api])

  const onlineMeetups = useMemo(
    () =>
      meetups.filter((m) => m.locationType === 'Online').sort((a, b) => a.timestamp - b.timestamp),
    [meetups],
  )

  const inPersonMeetups = useMemo(() => {
    return meetups
      .filter((m) => m.locationType === 'InPerson')
      .map((m) => {
        const [lat, lon] = m.location.split(',').map(Number)
        const distance =
          userLocation && !isNaN(lat) && !isNaN(lon)
            ? calculateDistance(userLocation.latitude, userLocation.longitude, lat, lon)
            : Infinity
        return { ...m, distance, lat, lon }
      })
      .sort((a, b) =>
        userLocation && !locationError ? a.distance - b.distance : a.timestamp - b.timestamp,
      )
  }, [meetups, userLocation, locationError])

  const closestMeetupId =
    inPersonMeetups.length > 0 && inPersonMeetups[0]?.distance !== Infinity
      ? inPersonMeetups[0].id
      : null

  useEffect(() => {
    if (!isMounted || inPersonMeetups.length === 0) {
      setInitialMapCenter([20, 0])
      return
    }
    const closestMeetup = inPersonMeetups[0]
    if (closestMeetup.lat && closestMeetup.lon && closestMeetup.distance !== Infinity) {
      setInitialMapCenter([closestMeetup.lat, closestMeetup.lon])
    } else {
      setInitialMapCenter([20, 0])
    }
  }, [isMounted, inPersonMeetups])

  const parseLocation = (location: string): [number, number] | null => {
    if (!location.includes(',')) return null
    const [lat, lng] = location.split(',').map(Number)
    return isNaN(lat) || isNaN(lng) ? null : [lat, lng]
  }

  const mapMarkers = useMemo(() => {
    return inPersonMeetups
      .map((meetup) => {
        const pos = parseLocation(meetup.location)
        if (!pos) return null
        return (
          <Marker key={meetup.id} position={pos} icon={meetupIcon}>
            <Popup>
              <div className="w-72">
                <MeetupCard
                  meetup={meetup}
                  decimals={decimals}
                  tokenSymbol={tokenSymbol}
                  userTimezone={userTimezone}
                  isClosest={meetup.id === closestMeetupId}
                  onViewChange={onViewChange}
                />
              </div>
            </Popup>
          </Marker>
        )
      })
      .filter(Boolean)
  }, [inPersonMeetups, decimals, tokenSymbol, userTimezone, closestMeetupId, onViewChange])

  const renderMap = () => {
    if (!isMounted) return null
    return (
      <div className="relative z-10 h-[500px] w-full overflow-hidden rounded-xl border border-gray-200 shadow-lg">
        <MapContainer
          center={initialMapCenter}
          zoom={closestMeetupId ? 12 : 2}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <MarkerClusterGroup chunkedLoading iconCreateFunction={createClusterIcon}>
            {mapMarkers}
          </MarkerClusterGroup>
        </MapContainer>
        {inPersonMeetups.length === 0 && (
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 transform rounded-full bg-white px-4 py-2 text-sm text-gray-600 shadow">
            No in-person meetups to display.
          </p>
        )}
      </div>
    )
  }

  if (showMapOnly) return renderMap()

  if (fetchIsLoading) {
    return (
      <div className="space-y-12">
        <section className="space-y-6">
          <div className="h-12 w-1/4 animate-pulse rounded-lg bg-gray-200 shadow-md" />
          <div className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4">
            {Array(3)
              .fill(0)
              .map((_, i) => (
                <div
                  key={i}
                  className="h-[380px] w-[350px] animate-pulse rounded-xl bg-gray-200 shadow-md"
                />
              ))}
          </div>
        </section>
        <section className="space-y-6">
          <div className="h-[500px] animate-pulse rounded-xl bg-gray-200 shadow-md" />
          <div className="h-12 w-1/4 animate-pulse rounded-lg bg-gray-200 shadow-md" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array(3)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="h-[380px] animate-pulse rounded-xl bg-gray-200 shadow-md" />
              ))}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-12">
      <section className="relative">
        <motion.h2
          className="sticky top-16 z-20 mb-6 rounded-lg bg-gray-100 px-4 py-2 text-4xl font-extrabold text-indigo-800 shadow-md"
          style={{ opacity: onlineOpacity }}
        >
          Online Meetups
        </motion.h2>
        {onlineMeetups.length === 0 ? (
          <p className="py-8 text-center text-lg italic text-gray-600">
            No upcoming online meetups found.
          </p>
        ) : (
          <div ref={onlineRef} className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4">
            {onlineMeetups.map((meetup) => (
              <MeetupCard
                key={meetup.id}
                meetup={meetup}
                decimals={decimals}
                tokenSymbol={tokenSymbol}
                userTimezone={userTimezone}
                onViewChange={onViewChange}
              />
            ))}
          </div>
        )}
      </section>

      <section className="relative">
        {renderMap()}
        <motion.h2 className="sticky top-16 z-20 mb-6 mt-8 rounded-lg bg-gray-100 px-4 py-2 text-4xl font-extrabold text-teal-800 shadow-md">
          In-Person Meetups
        </motion.h2>
        {inPersonMeetups.length === 0 ? (
          <p className="py-8 text-center text-lg italic text-gray-600">
            No upcoming in-person meetups found.
          </p>
        ) : (
          <>
            {locationError && (
              <p className="mb-4 rounded-lg bg-yellow-100 py-2 text-center text-sm text-yellow-700">
                {locationError}
              </p>
            )}
            <div ref={inPersonRef} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {inPersonMeetups.map((meetup) => (
                <MeetupCard
                  key={meetup.id}
                  meetup={meetup}
                  decimals={decimals}
                  tokenSymbol={tokenSymbol}
                  userTimezone={userTimezone}
                  isClosest={meetup.id === closestMeetupId}
                  onViewChange={onViewChange}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
