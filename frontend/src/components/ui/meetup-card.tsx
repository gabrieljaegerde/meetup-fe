'use client'

import { Button } from '@/components/ui/button'
import { getAddressFromCoords } from '@/lib/geolocation'
import { formatCountdown, formatPrice, isLowAvailability, isPopular, isWithinThreeDays } from '@/lib/meetup-utils'
import { Meetup } from '@/types/meetup'
import { cn } from '@/utils/cn'
import { format, toZonedTime } from 'date-fns-tz'
import { motion } from 'framer-motion'
import { Globe, MapPin } from 'lucide-react'

interface MeetupCardProps {
    meetup: Meetup & { distance?: number; lat?: number; lon?: number }
    decimals: number
    tokenSymbol: string
    userTimezone: string
    isClosest?: boolean
    onViewChange: (view: { details: number }) => void
}

export const MeetupCard: React.FC<MeetupCardProps> = ({
    meetup,
    decimals,
    tokenSymbol,
    userTimezone,
    isClosest,
    onViewChange,
}) => {
    const isFull = meetup.attendees.length >= meetup.maxAttendees
    const isSoon = isWithinThreeDays(meetup.timestamp)
    const isPop = isPopular(meetup.attendees, meetup.maxAttendees)
    const isLow = isLowAvailability(meetup.attendees, meetup.maxAttendees)
    const flags = [isFull && 'Full', isSoon && 'Soon', isClosest && 'Closest', isPop && 'Popular', isLow && 'Low'].filter(Boolean)
    const flagText = flags.length > 0 ? flags.join(' & ') : null

    // Timestamp is in UTC milliseconds from the contract
    const eventDate = new Date(meetup.timestamp)

    // Main display time: Convert UTC timestamp to user's timezone for online, or meetup's timezone for in-person
    const displayTime =
        meetup.locationType === 'Online'
            ? format(toZonedTime(eventDate, userTimezone), 'MMM d, yyyy h:mm a')
            : format(toZonedTime(eventDate, meetup.timezone || 'UTC'), 'MMM d, yyyy h:mm a')
    const displayTimezone =
        meetup.locationType === 'Online' ? userTimezone : meetup.timezone || 'UTC'

    // UTC time: Use raw JS to ensure correct UTC display
    const utcTime = new Date(meetup.timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
        timeZone: 'UTC',
    })
    console.log('utcTime (JS):', utcTime)

    const dateStr = `${displayTime} (${displayTimezone})`

    const twoDaysInMs = 48 * 60 * 60 * 1000
    const isWithinTwoDays = meetup.timestamp > Date.now() && meetup.timestamp <= Date.now() + twoDaysInMs
    const countdown = isWithinTwoDays ? formatCountdown(meetup.timestamp, Date.now()) : null

    const isLatLong = meetup.locationType === 'InPerson' && meetup.location.match(/^-?\d+\.\d+,\s?-?\d+\.\d+$/)
    const [lat, long] = isLatLong ? meetup.location.split(',').map((coord) => parseFloat(coord.trim())) : [null, null]
    const shortLat = lat?.toFixed(3)
    const shortLong = long?.toFixed(3)
    const displayLocation = isLatLong ? `${shortLat}, ${shortLong}` : meetup.location

    const descriptionSnippet = meetup.description.length > 60 ? meetup.description.substring(0, 60) + '...' : meetup.description

    const getCardStyles = () =>
        cn(
            'relative overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 border rounded-xl',
            flags.length > 1
                ? 'bg-gradient-to-br from-pink-100 via-purple-100 to-blue-100 border-gray-300'
                : isFull
                    ? 'bg-red-100 border-red-300'
                    : isSoon
                        ? 'bg-orange-100 border-orange-300'
                        : isClosest
                            ? 'bg-yellow-100 border-yellow-400'
                            : isPop
                                ? 'bg-purple-100 border-purple-300'
                                : isLow
                                    ? 'bg-yellow-100 border-yellow-300'
                                    : 'bg-gray-50 border-gray-200',
            'text-gray-800 w-full max-w-[350px] h-[380px] flex flex-col'
        )

    const getFlagStyles = () =>
        cn(
            'absolute top-2 right-2 text-white text-xs font-semibold px-2 py-1 rounded-full shadow-lg transform rotate-12 z-10',
            flags.length > 1
                ? 'bg-gradient-to-r from-pink-600 via-purple-600 to-blue-600'
                : isFull
                    ? 'bg-red-600'
                    : isSoon
                        ? 'bg-orange-600'
                        : isClosest
                            ? 'bg-yellow-600'
                            : isPop
                                ? 'bg-purple-600'
                                : 'bg-yellow-600'
        )

    const handleLocationClick = async () => {
        if (isLatLong) {
            const address = await getAddressFromCoords(meetup.location)
            alert(`Coordinates: ${meetup.location}\nAddress: ${address}`)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={getCardStyles()}
        >
            {flagText && (
                <motion.span
                    initial={{ opacity: 0, rotate: 0 }}
                    animate={{ opacity: 1, rotate: 12 }}
                    transition={{ delay: 0.2 }}
                    className={getFlagStyles()}
                >
                    {flagText}
                </motion.span>
            )}
            <div className="p-4 flex flex-col flex-1">
                <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-2xl font-bold text-gray-900">{meetup.title}</h4>
                    {meetup.locationType === 'Online' ? (
                        <span className="flex items-center gap-1" title="Online">
                            <Globe className="w-5 h-5 text-indigo-600" />
                            <span className="text-sm text-indigo-600">Online</span>
                        </span>
                    ) : (
                        <span className="flex items-center gap-1" title="In-Person">
                            <MapPin className="w-5 h-5 text-green-600" />
                            <span className="text-sm text-green-600">In-Person</span>
                        </span>
                    )}
                </div>
                <p className="text-sm text-gray-700 line-clamp-2 mb-3">{descriptionSnippet}</p>
                <div className="space-y-1 text-sm text-gray-700 flex-1">
                    <p>
                        <span className="font-semibold text-gray-900">Date:</span> {dateStr}
                        {meetup.locationType === 'Online' && <span className="block text-xs text-gray-500">({utcTime} UTC)</span>}
                    </p>
                    {countdown && (
                        <p>
                            <span className="font-semibold text-gray-900">Starts in:</span> {countdown}
                        </p>
                    )}
                    <p>
                        <span className="font-semibold text-gray-900">Location:</span>{' '}
                        {meetup.locationType === 'Online' ? (
                            <a href={meetup.location} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                                {meetup.location || 'TBA'}
                            </a>
                        ) : isLatLong ? (
                            <span className="text-green-600 hover:underline cursor-pointer" onClick={handleLocationClick}>
                                {displayLocation}
                            </span>
                        ) : (
                            <span>{meetup.location}</span>
                        )}
                    </p>
                    {meetup.distance && meetup.distance !== Infinity && (
                        <p>
                            <span className="font-semibold text-gray-900">Distance:</span> {meetup.distance.toFixed(1)} km
                        </p>
                    )}
                    <p>
                        <span className="font-semibold text-gray-900">Price:</span> {formatPrice(meetup.price, decimals, tokenSymbol)}
                    </p>
                    <p>
                        <span className="font-semibold text-gray-900">Attendees:</span> {meetup.attendees.length}/{meetup.maxAttendees}
                    </p>
                    <p>
                        <span className="font-semibold text-gray-900">Host:</span> {meetup.host.slice(0, 6)}...{meetup.host.slice(-4)}
                    </p>
                </div>
                <Button
                    onClick={() => onViewChange({ details: meetup.id })}
                    className={cn(
                        'mt-4 w-full font-semibold text-white py-3 rounded-lg transition-all duration-300 hover:shadow-lg',
                        meetup.locationType === 'Online'
                            ? 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700'
                            : 'bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700'
                    )}
                >
                    View Details
                </Button>
            </div>
        </motion.div>
    )
}