'use client'

import dynamic from 'next/dynamic'
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ContractIds } from '@/deployments/deployments'
import { RadioGroup, RadioGroupItem } from '@radix-ui/react-radio-group'
import { contractTx, useInkathon, useRegisteredContract } from '@scio-labs/use-inkathon'
import L, { LeafletMouseEvent } from 'leaflet'
import toast from 'react-hot-toast'
import { useMap, useMapEvents } from 'react-leaflet'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface CreateMeetupProps {
  onViewChange: (view: 'home' | 'create' | { details: number }) => void
}

// Improved debounce utility that returns a memoized function
function useDebounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(() => {
        func(...args)
        timeoutRef.current = null
      }, wait)
    },
    [func, wait],
  )
}

// Map click handler component
const MapClickHandler = ({
  onLocationSelect,
}: {
  onLocationSelect: (lat: number, lng: number) => void
}) => {
  const map = useMapEvents({
    click(e: LeafletMouseEvent) {
      onLocationSelect(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// Improved MapRecenter component with better update handling
const MapRecenter = ({
  coordinates,
  address,
}: {
  coordinates: [number, number] | null
  address: string
}) => {
  const map = useMap()

  useEffect(() => {
    if (coordinates) {
      map.setView(coordinates, 15)
    }
  }, [coordinates, map])

  return null
}

// Dynamic imports for SSR compatibility with explicit loading states
const MapContainerDynamic = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), {
  ssr: false,
  loading: () => (
    <div className="flex h-[300px] w-full items-center justify-center rounded-lg bg-gray-100">
      Loading map...
    </div>
  ),
})
const TileLayerDynamic = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), {
  ssr: false,
})
const MarkerDynamic = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), {
  ssr: false,
})
const PopupDynamic = dynamic(() => import('react-leaflet').then((mod) => mod.Popup), { ssr: false })

export const CreateMeetup = ({ onViewChange }: CreateMeetupProps) => {
  const { api, activeAccount, activeSigner } = useInkathon()
  const { contract } = useRegisteredContract(ContractIds.Meetup)
  const [title, setTitle] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [locationType, setLocationType] = useState<'online' | 'irl'>('online')
  const [address, setAddress] = useState<string>('')
  const [addressOptions, setAddressOptions] = useState<
    { place_id: string; display_name: string; lat: string; lon: string }[]
  >([])
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null)
  const [onlineMeetingUrl, setOnlineMeetingUrl] = useState<string>('')
  const [timestamp, setTimestamp] = useState<string>('')
  const [maxAttendees, setMaxAttendees] = useState<string>('')
  const [price, setPrice] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [isMounted, setIsMounted] = useState<boolean>(false)
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false)
  const [isSearchLoading, setIsSearchLoading] = useState<boolean>(false)

  // References for better control
  const abortControllerRef = useRef<AbortController | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const mapInitializedRef = useRef<boolean>(false)

  // Custom marker icon - memoized to prevent recreating on every render
  const markerIcon = useMemo(
    () =>
      new L.Icon({
        iconUrl: 'https://leafletjs.com/examples/custom-icons/leaf-red.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
      }),
    [],
  )

  // Ensure client-side mounting
  useEffect(() => {
    setIsMounted(true)
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Detect user's location on initial load
  useEffect(() => {
    if (isMounted && locationType === 'irl' && !coordinates && !mapInitializedRef.current) {
      mapInitializedRef.current = true
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setCoordinates([position.coords.latitude, position.coords.longitude])
            reverseGeocode(position.coords.latitude, position.coords.longitude)
          },
          (error) => {
            console.log('Geolocation error:', error)
            // Default to a central location if geolocation fails
            setCoordinates([51.505, -0.09])
          },
        )
      }
    }
  }, [isMounted, locationType])

  const encodeVecU8 = (str: string) => Array.from(new TextEncoder().encode(str))

  // Improved geocoding function with proper error handling
  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } },
      )

      if (!response.ok) throw new Error('Geocoding request failed')

      const data = await response.json()
      if (data && data.display_name) {
        setAddress(data.display_name)
      }
    } catch (error) {
      console.error('Error reverse geocoding:', error)
      // Don't show error toast for reverse geocoding as it's not critical
    }
  }

  // Improved fetch address suggestions with better cancellation and loading states
  const fetchAddressSuggestions = useDebounce(async (query: string) => {
    if (!query || query.length < 3) {
      setAddressOptions([])
      setIsSearchLoading(false)
      return
    }

    setIsSearchLoading(true)

    // Clean up previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const newController = new AbortController()
    abortControllerRef.current = newController

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
        {
          signal: newController.signal,
          headers: { 'Accept-Language': 'en' },
        },
      )

      if (!response.ok) throw new Error('Search request failed')

      const data = await response.json()
      setAddressOptions(data)
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error fetching address suggestions:', error)
        // Don't show toast for aborted requests
        toast.error('Failed to fetch address suggestions.')
      }
    } finally {
      setIsSearchLoading(false)
    }
  }, 350) // Reduced debounce time for better responsiveness

  // Handle address input change
  const handleAddressChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setAddress(value)
    fetchAddressSuggestions(value)
  }

  // Handle address selection from dropdown
  const handleAddressSelect = (option: {
    place_id: string
    display_name: string
    lat: string
    lon: string
  }) => {
    setAddress(option.display_name)
    const lat = parseFloat(option.lat)
    const lng = parseFloat(option.lon)
    setCoordinates([lat, lng])
    setAddressOptions([])
    setIsSearchFocused(false)

    // Clear any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }

  // Handle map click with improved feedback
  const handleMapClick = (lat: number, lng: number) => {
    setCoordinates([lat, lng])
    reverseGeocode(lat, lng)
    toast.success(`Location selected at coordinates: (${lat.toFixed(4)}, ${lng.toFixed(4)})`)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!api || !activeAccount || !activeSigner || !contract) {
      toast.error('Please connect your wallet and ensure the contract is loaded.')
      return
    }

    setIsSubmitting(true)
    try {
      const timestampMs = new Date(timestamp).getTime()
      const maxAttendeesNum = parseInt(maxAttendees, 10)
      const priceNum = BigInt(Math.floor(parseFloat(price) * 1e18))

      if (isNaN(timestampMs) || timestampMs <= Date.now()) {
        throw new Error('Please select a future date and time.')
      }
      if (isNaN(maxAttendeesNum) || maxAttendeesNum <= 0) {
        throw new Error('Max attendees must be a positive number.')
      }
      if (isNaN(Number(price)) || Number(price) < 0) {
        throw new Error('Price must be a non-negative number.')
      }

      // Prepare location data based on type
      let locationData: string
      let locationTypeParam: { Online?: null } | { InPerson?: null }

      if (locationType === 'online') {
        locationTypeParam = { Online: null }
        locationData = onlineMeetingUrl || 'No meeting URL provided'
      } else {
        locationTypeParam = { InPerson: null }
        if (!coordinates) {
          throw new Error('Please select a location on the map or enter a valid address.')
        }
        // Store only coordinates, no address
        locationData = `${coordinates[0]},${coordinates[1]}`
      }

      const args = [
        encodeVecU8(title),
        encodeVecU8(description),
        locationTypeParam,
        encodeVecU8(locationData),
        timestampMs,
        maxAttendeesNum,
        priceNum,
      ]

      await contractTx(
        api,
        activeAccount.address,
        contract,
        'create_meetup',
        { value: BigInt(1e18) }, // 1 SBY deposit as defined in your contract
        args,
      )

      toast.success('Meetup created successfully!')
      onViewChange('home')
    } catch (error: any) {
      console.error('Error creating meetup:', error)
      toast.error(`Failed to create meetup: ${error.message || 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBack = () => {
    onViewChange('home')
  }

  // Clear coordinate selection
  const handleClearLocation = () => {
    setCoordinates(null)
    setAddress('')
    if (searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }

  if (!isMounted) return null

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 p-4">
      <h2 className="text-center font-mono text-2xl text-gray-800">Create a New Meetup</h2>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter meetup title"
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter meetup description"
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Location Type</Label>
          <RadioGroup
            value={locationType}
            onValueChange={(value: 'online' | 'irl') => setLocationType(value)}
            className="flex gap-4"
            disabled={isSubmitting}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="online"
                id="online"
                className="h-4 w-4 rounded-full border-2 border-gray-400 data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-500"
              />
              <Label htmlFor="online">Online</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="irl"
                id="irl"
                className="h-4 w-4 rounded-full border-2 border-gray-400 data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-500"
              />
              <Label htmlFor="irl">In Real Life</Label>
            </div>
          </RadioGroup>
        </div>

        {locationType === 'online' ? (
          // Online meetup form section
          <div className="flex flex-col gap-2">
            <Label htmlFor="meetingUrl">Meeting URL</Label>
            <Input
              id="meetingUrl"
              type="text"
              value={onlineMeetingUrl}
              onChange={(e) => setOnlineMeetingUrl(e.target.value)}
              placeholder="Enter meeting URL (Zoom, Google Meet, etc.)"
              disabled={isSubmitting}
            />
          </div>
        ) : (
          // In-person meetup form section
          <div className="flex flex-col gap-4">
            <div className="relative flex flex-col gap-2">
              <Label htmlFor="address">Search for Address</Label>
              <div className="relative">
                <Input
                  id="address"
                  type="text"
                  value={address}
                  onChange={handleAddressChange}
                  placeholder="Search for an address or place..."
                  disabled={isSubmitting}
                  className="w-full pr-10"
                  ref={searchInputRef}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => {
                    // Delay hiding dropdown to allow clicks on options
                    setTimeout(() => setIsSearchFocused(false), 200)
                  }}
                />
                {address && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 transform text-gray-500 hover:text-gray-700"
                    onClick={handleClearLocation}
                  >
                    ✕
                  </button>
                )}
                {isSearchLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 transform">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-500"></div>
                  </div>
                )}
              </div>
              {isSearchFocused && addressOptions.length > 0 && (
                <ul className="absolute top-full z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg">
                  {addressOptions.map((option) => (
                    <li
                      key={option.place_id || `${option.lat}-${option.lon}`}
                      onClick={() => handleAddressSelect(option)}
                      className="cursor-pointer truncate px-4 py-2 text-sm text-gray-800 hover:bg-blue-50"
                    >
                      {option.display_name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Select Location on Map</Label>
                {coordinates && (
                  <span className="text-xs text-blue-600">
                    {coordinates[0].toFixed(4)}, {coordinates[1].toFixed(4)}
                  </span>
                )}
              </div>
              <div className="relative z-10 h-[350px] w-full overflow-hidden rounded-lg border border-gray-300 shadow-sm">
                <MapContainerDynamic
                  center={coordinates || [20, 0]}
                  zoom={coordinates ? 15 : 2}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={true}
                  attributionControl={false}
                >
                  <TileLayerDynamic
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  {coordinates && (
                    <MarkerDynamic position={coordinates} icon={markerIcon}>
                      <PopupDynamic>
                        <div className="text-sm">
                          <strong>Selected Location</strong>
                          <br />
                          {address || 'No address information'}
                        </div>
                      </PopupDynamic>
                    </MarkerDynamic>
                  )}
                  <MapClickHandler onLocationSelect={handleMapClick} />
                  <MapRecenter coordinates={coordinates} address={address} />
                </MapContainerDynamic>
              </div>
              <p className="text-xs italic text-gray-500">
                Click on the map to select a location or search for an address above.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="timestamp">Date and Time</Label>
          <Input
            id="timestamp"
            type="datetime-local"
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="maxAttendees">Max Attendees</Label>
          <Input
            id="maxAttendees"
            type="number"
            value={maxAttendees}
            onChange={(e) => setMaxAttendees(e.target.value)}
            placeholder="Enter max attendees"
            min="1"
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="price">Price (SBY)</Label>
          <Input
            id="price"
            type="number"
            step="0.000000000000000001"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Enter price in SBY"
            min="0"
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="mt-4 flex justify-center gap-4">
          <Button
            type="submit"
            className="bg-blue-500 font-bold text-white"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create Meetup'}
          </Button>
          <Button
            type="button"
            onClick={handleBack}
            className="bg-gray-500 text-white"
            disabled={isSubmitting}
          >
            Back to Home
          </Button>
        </div>
      </form>

      {!activeAccount && (
        <p className="mt-2 text-center text-sm text-red-600">
          Please connect your wallet to create a meetup.
        </p>
      )}
    </div>
  )
}
