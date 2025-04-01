'use client'

import dynamic from 'next/dynamic'
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ContractIds } from '@/deployments/deployments'
import { u32, u64 } from '@polkadot/types'
import { contractTx, useInkathon, useRegisteredContract } from '@scio-labs/use-inkathon'
import { format } from 'date-fns'
// Import parse from date-fns
import { fromZonedTime } from 'date-fns-tz'
// Import timezone functions from date-fns-tz
import L, { LeafletMouseEvent } from 'leaflet'
import { Calendar, DollarSign, Edit2, MapPin, Users, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useMap, useMapEvents } from 'react-leaflet'
import TimezoneSelect from 'react-timezone-select'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

interface CreateMeetupProps {
  onViewChange: (view: 'home' | 'create' | { details: number }) => void
  onRefetch?: () => Promise<void>
}

function useDebounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => func(...args), wait)
    },
    [func, wait],
  )
}

const MapClickHandler = ({
  onLocationSelect,
}: {
  onLocationSelect: (lat: number, lng: number) => void
}) => {
  const map = useMap()
  useMapEvents({
    click(e: LeafletMouseEvent) {
      onLocationSelect(e.latlng.lat, e.latlng.lng)
      map.setView([e.latlng.lat, e.latlng.lng], map.getZoom())
    },
  })
  return null
}

const MapRecenter = ({ coordinates }: { coordinates: [number, number] | null }) => {
  const map = useMap()
  useEffect(() => {
    if (coordinates) map.setView(coordinates, map.getZoom())
  }, [coordinates, map])
  return null
}

const MapContainerDynamic = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), {
  ssr: false,
})
const TileLayerDynamic = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), {
  ssr: false,
})
const MarkerDynamic = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), {
  ssr: false,
})
const PopupDynamic = dynamic(() => import('react-leaflet').then((mod) => mod.Popup), { ssr: false })

export const CreateMeetup = ({ onViewChange, onRefetch }: CreateMeetupProps) => {
  const { api, activeAccount, activeSigner } = useInkathon()
  const { contract } = useRegisteredContract(ContractIds.Meetup)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [locationType, setLocationType] = useState<'online' | 'irl'>('online')
  const [address, setAddress] = useState('')
  const [addressOptions, setAddressOptions] = useState<
    { place_id: string; display_name: string; lat: string; lon: string }[]
  >([])
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null)
  const [onlineMeetingUrl, setOnlineMeetingUrl] = useState('')
  const [timestamp, setTimestamp] = useState('')
  const [maxAttendees, setMaxAttendees] = useState('')
  const [price, setPrice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [eventTimezone, setEventTimezone] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone, // Default to user's timezone
  )
  const [isAddressDropdownOpen, setIsAddressDropdownOpen] = useState(false)

  const MAX_TEXT_BYTES = 128 // Contract limit for Vec<u8>
  const MAX_ATTENDEES = 1000 // Practical UI cap (u32 max is ~4.29B)
  const MAX_CHARS = 128 // Assuming 1 byte per char for simplicity
  const abortControllerRef = useRef<AbortController | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLUListElement>(null)

  const meetupIcon = useMemo(
    () =>
      new L.Icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/149/149060.png',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      }),
    [],
  )

  const timezoneSelectStyles = {
    control: (base: any) => ({
      ...base,
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      padding: '0.5rem',
      fontSize: '0.875rem',
      backgroundColor: '#ffffff',
      color: '#111827',
      boxShadow: 'none',
      '&:hover': {
        borderColor: '#a5b4fc',
      },
      '&:focus': {
        borderColor: '#4f46e5',
        boxShadow: '0 0 0 1px #4f46e5',
      },
    }),
    menu: (base: any) => ({
      ...base,
      border: '1px solid #d1d5db',
      borderRadius: '0.375rem',
      backgroundColor: '#ffffff',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      maxHeight: '200px',
      overflowY: 'auto',
    }),
    option: (base: any, state: any) => ({
      ...base,
      padding: '0.5rem',
      color: '#111827',
      backgroundColor: state.isFocused || state.isSelected ? '#e0e7ff' : '#ffffff',
      cursor: 'pointer',
      '&:hover': {
        backgroundColor: '#e0e7ff',
      },
    }),
  }

  useEffect(() => {
    if (locationType === 'irl' && !coordinates) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoordinates([position.coords.latitude, position.coords.longitude])
          reverseGeocode(position.coords.latitude, position.coords.longitude)
        },
        () => {
          setCoordinates([51.505, -0.09])
          setEventTimezone('Europe/London')
        },
      )
    }
  }, [locationType])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchInputRef.current &&
        dropdownRef.current &&
        !searchInputRef.current.contains(event.target as Node) &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsAddressDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const encodeVecU8 = (str: string) => Array.from(new TextEncoder().encode(str))

  const getByteLength = (str: string) => encodeVecU8(str).length

  const validateTextLength = (str: string, label: string) => {
    const bytes = getByteLength(str)
    if (bytes > MAX_TEXT_BYTES)
      throw new Error(`${label} exceeds ${MAX_TEXT_BYTES} bytes (${bytes} bytes).`)
  }

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&extratags=1`,
        { headers: { 'Accept-Language': 'en' } },
      )
      if (!response.ok) throw new Error('Geocoding request failed')
      const data = await response.json()
      if (data?.display_name) {
        setAddress(data.display_name.slice(0, MAX_CHARS))
        const timezone =
          data?.extratags?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
        setEventTimezone(timezone.slice(0, MAX_CHARS))
      }
    } catch (error) {
      console.error('Error reverse geocoding:', error)
      setEventTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    }
  }

  const fetchAddressSuggestions = useDebounce(async (query: string) => {
    if (!query || query.length < 3) {
      setAddressOptions([])
      setIsAddressDropdownOpen(false)
      return
    }
    if (abortControllerRef.current) abortControllerRef.current.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&extratags=1`,
        { signal: controller.signal, headers: { 'Accept-Language': 'en' } },
      )
      if (!response.ok) throw new Error('Search request failed')
      const data = await response.json()
      setAddressOptions(data)
      setIsAddressDropdownOpen(true)
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error fetching address suggestions:', error)
        toast.error('Failed to fetch address suggestions.')
      }
    }
  }, 350)

  const handleAddressChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setAddress(value)
    fetchAddressSuggestions(value)
  }

  const handleAddressSelect = (option: { display_name: string; lat: string; lon: string }) => {
    setAddress(option.display_name)
    const lat = parseFloat(option.lat)
    const lon = parseFloat(option.lon)
    setCoordinates([lat, lon])
    setAddressOptions([])
    setIsAddressDropdownOpen(false)
    reverseGeocode(lat, lon)
  }

  const handleMapClick = (lat: number, lng: number) => {
    setCoordinates([lat, lng])
    reverseGeocode(lat, lng)
    toast.success(`Location set: (${lat.toFixed(4)}, ${lng.toFixed(4)})`)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!api || !activeAccount || !activeSigner || !contract) {
      toast.error('Please connect your wallet.')
      return
    }

    setIsSubmitting(true)
    try {
      const localDate = new Date(timestamp) // Use native JS parsing for submission
      const utcDate = fromZonedTime(localDate, eventTimezone)
      const timestampMs = utcDate.getTime()

      const maxAttendeesNum = parseInt(maxAttendees, 10)
      const priceNum = BigInt(Math.floor(parseFloat(price) * 1e18))

      if (isNaN(timestampMs) || timestampMs <= Date.now()) {
        throw new Error('Please select a future date and time.')
      }
      if (isNaN(maxAttendeesNum) || maxAttendeesNum <= 0 || maxAttendeesNum > MAX_ATTENDEES) {
        throw new Error(`Max attendees must be between 1 and ${MAX_ATTENDEES}.`)
      }
      if (isNaN(Number(price)) || Number(price) < 0) {
        throw new Error('Price must be non-negative.')
      }
      validateTextLength(title, 'Title')
      validateTextLength(description, 'Description')
      validateTextLength(eventTimezone, 'Timezone')

      let locationTypeParam: { Online?: null } | { InPerson?: null }
      let locationData: string
      if (locationType === 'online') {
        locationTypeParam = { Online: null }
        locationData = onlineMeetingUrl || 'No meeting URL provided'
      } else {
        if (!coordinates) throw new Error('Please select a location.')
        locationTypeParam = { InPerson: null }
        locationData = `${coordinates[0]},${coordinates[1]}`
      }
      validateTextLength(locationData, 'Location')

      const args = [
        encodeVecU8(title),
        encodeVecU8(description),
        locationTypeParam,
        encodeVecU8(locationData),
        encodeVecU8(eventTimezone),
        new u64(contract!.registry, timestampMs),
        new u32(contract!.registry, maxAttendeesNum),
        priceNum,
      ]

      await contractTx(
        api,
        activeAccount.address,
        contract,
        'create_meetup',
        { value: BigInt(1e18) },
        args,
      )
      toast.success('Meetup created successfully!')
      if (onRefetch) await onRefetch()
      onViewChange('home')
    } catch (error: any) {
      console.error('Submit Error:', error)
      toast.error(`Failed to create meetup: ${error.message || 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBack = () => onViewChange('home')

  const handleClearLocation = () => {
    setCoordinates(null)
    setAddress('')
    setEventTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    setIsAddressDropdownOpen(false)
    searchInputRef.current?.focus()
  }

  // Compute time displays
  const localDate = timestamp ? new Date(timestamp) : null
  const utcTimeDisplay = localDate
    ? new Date(fromZonedTime(localDate, eventTimezone)).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
        timeZone: 'UTC',
      })
    : ''
  const localTimeDisplay = localDate
    ? format(localDate, 'MMM d, yyyy h:mm a') + ` (${eventTimezone})`
    : ''

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 px-4 pb-8 pt-20">
      <div className="relative z-0 mx-auto w-full max-w-2xl rounded-2xl bg-white p-8 shadow-2xl">
        <h1 className="mb-6 text-3xl font-bold text-gray-900">Create a New Meetup</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium text-gray-700">
              Title
            </Label>
            <div className="relative">
              <Input
                id="title"
                value={title}
                onChange={(e) =>
                  e.target.value.length <= MAX_CHARS
                    ? setTitle(e.target.value)
                    : toast.error(`Title exceeds ${MAX_CHARS} characters`)
                }
                placeholder="Enter meetup title"
                required
                disabled={isSubmitting}
                className="border-gray-300 pl-10 focus:border-indigo-500 focus:ring-indigo-500"
              />
              <Edit2 className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
            </div>
            <p className="text-xs text-gray-500">{MAX_CHARS - title.length} characters remaining</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium text-gray-700">
              Description
            </Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) =>
                e.target.value.length <= MAX_CHARS
                  ? setDescription(e.target.value)
                  : toast.error(`Description exceeds ${MAX_CHARS} characters`)
              }
              placeholder="Describe your meetup..."
              required
              disabled={isSubmitting}
              className="h-32 w-full rounded-lg border border-gray-300 p-3 text-sm transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-500">
              {MAX_CHARS - description.length} characters remaining
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Meetup Type</Label>
            <RadioGroup
              value={locationType}
              onValueChange={(value: 'online' | 'irl') => setLocationType(value)}
              className="flex gap-4"
              disabled={isSubmitting}
            >
              <div className="flex w-full items-center gap-2 rounded-lg bg-gray-100 p-3">
                <RadioGroupItem value="online" id="online" className="text-indigo-600" />
                <Label htmlFor="online" className="cursor-pointer text-gray-700">
                  Online
                </Label>
              </div>
              <div className="flex w-full items-center gap-2 rounded-lg bg-gray-100 p-3">
                <RadioGroupItem value="irl" id="irl" className="text-indigo-600" />
                <Label htmlFor="irl" className="cursor-pointer text-gray-700">
                  In-Person
                </Label>
              </div>
            </RadioGroup>
          </div>

          {locationType === 'online' ? (
            <div className="space-y-2">
              <Label htmlFor="meetingUrl" className="text-sm font-medium text-gray-700">
                Meeting URL
              </Label>
              <Input
                id="meetingUrl"
                value={onlineMeetingUrl}
                onChange={(e) =>
                  e.target.value.length <= MAX_CHARS
                    ? setOnlineMeetingUrl(e.target.value)
                    : toast.error(`Meeting URL exceeds ${MAX_CHARS} characters`)
                }
                placeholder="e.g., Zoom or Google Meet link"
                disabled={isSubmitting}
                className="border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500">
                {MAX_CHARS - onlineMeetingUrl.length} characters remaining
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative space-y-2">
                <Label htmlFor="address" className="text-sm font-medium text-gray-700">
                  Location Search
                </Label>
                <div className="relative">
                  <Input
                    id="address"
                    value={address}
                    onChange={handleAddressChange}
                    placeholder="Search for a place or address"
                    disabled={isSubmitting}
                    ref={searchInputRef}
                    className="border-gray-300 pl-10 focus:border-indigo-500 focus:ring-indigo-500"
                    onFocus={() => addressOptions.length > 0 && setIsAddressDropdownOpen(true)}
                  />
                  <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
                  {address && (
                    <button
                      type="button"
                      onClick={handleClearLocation}
                      className="absolute right-3 top-1/2 -translate-y-1/2 transform text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {isAddressDropdownOpen && addressOptions.length > 0 && (
                  <ul
                    ref={dropdownRef}
                    className="absolute z-[1000] mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
                  >
                    {addressOptions.map((option) => (
                      <li
                        key={option.place_id || `${option.lat}-${option.lon}`}
                        onClick={() => handleAddressSelect(option)}
                        className="cursor-pointer px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                      >
                        {option.display_name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-gray-700">Pin Location</Label>
                  {coordinates && (
                    <span className="text-xs text-indigo-600">
                      {coordinates[0].toFixed(4)}, {coordinates[1].toFixed(4)}
                    </span>
                  )}
                </div>
                <div className="relative z-0 h-[400px] overflow-hidden rounded-lg border border-gray-200">
                  <MapContainerDynamic
                    center={coordinates || [20, 0]}
                    zoom={coordinates ? 15 : 2}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={true}
                    attributionControl={false}
                  >
                    <TileLayerDynamic url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    {coordinates && (
                      <MarkerDynamic position={coordinates} icon={meetupIcon}>
                        <PopupDynamic>{address || 'Selected Location'}</PopupDynamic>
                      </MarkerDynamic>
                    )}
                    <MapClickHandler onLocationSelect={handleMapClick} />
                    <MapRecenter coordinates={coordinates} />
                  </MapContainerDynamic>
                </div>
                <p className="text-xs text-gray-500">Click the map to set your meetup location</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="timestamp" className="text-sm font-medium text-gray-700">
              Date & Time
            </Label>
            <div className="relative">
              <Input
                id="timestamp"
                type="datetime-local"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
                required
                disabled={isSubmitting}
                className="border-gray-300 pl-10 focus:border-indigo-500 focus:ring-indigo-500"
              />
              <Calendar className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone" className="text-sm font-medium text-gray-700">
                Event Timezone
              </Label>
              <TimezoneSelect
                value={eventTimezone}
                onChange={(tz) => setEventTimezone(tz.value)}
                isDisabled={isSubmitting}
                classNamePrefix="timezone-select"
                styles={timezoneSelectStyles}
              />
            </div>
            <p className="text-xs text-gray-500">
              {timestamp
                ? locationType === 'online'
                  ? `UTC Time: ${utcTimeDisplay}`
                  : `Local Time: ${localTimeDisplay}`
                : 'Select the meetup date, time, and timezone'}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="maxAttendees" className="text-sm font-medium text-gray-700">
                Max Attendees
              </Label>
              <div className="relative">
                <Input
                  id="maxAttendees"
                  type="number"
                  value={maxAttendees}
                  onChange={(e) => setMaxAttendees(e.target.value)}
                  placeholder="e.g., 50"
                  min="1"
                  max={MAX_ATTENDEES}
                  required
                  disabled={isSubmitting}
                  className="border-gray-300 pl-10 focus:border-indigo-500 focus:ring-indigo-500"
                />
                <Users className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price" className="text-sm font-medium text-gray-700">
                Price (SBY)
              </Label>
              <div className="relative">
                <Input
                  id="price"
                  type="number"
                  step="0.000000000000000001"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g., 0.5"
                  min="0"
                  required
                  disabled={isSubmitting}
                  className="border-gray-300 pl-10 focus:border-indigo-500 focus:ring-indigo-500"
                />
                <DollarSign className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Button
              type="button"
              onClick={handleBack}
              disabled={isSubmitting}
              variant="outline"
              className="border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {isSubmitting ? 'Creating...' : 'Create Meetup'}
            </Button>
          </div>
        </form>
      </div>
      {!activeAccount && (
        <p className="mt-4 text-center text-sm text-red-600">
          Please connect your wallet to create a meetup.
        </p>
      )}
    </div>
  )
}
