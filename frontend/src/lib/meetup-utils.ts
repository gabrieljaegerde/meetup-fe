export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371 // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export const formatCountdown = (timestamp: number, currentTime: number): string => {
  const diffMs = timestamp - currentTime
  if (diffMs <= 0) return 'Started'
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000)
  return `${days}d ${hours}h ${minutes}m ${seconds}s`
}

export const formatPrice = (price: number, decimals: number, symbol: string): string =>
  `${(price / Math.pow(10, decimals)).toFixed(2)} ${symbol}`

export const isWithinThreeDays = (timestamp: number): boolean => {
  const now = Date.now()
  const threeDaysInMs = 72 * 60 * 60 * 1000
  return timestamp > now && timestamp <= now + threeDaysInMs
}

export const isPopular = (attendees: string[], maxAttendees: number): boolean =>
  attendees.length / maxAttendees >= 0.75 && attendees.length < maxAttendees

export const isLowAvailability = (attendees: string[], maxAttendees: number): boolean =>
  attendees.length / maxAttendees >= 0.9 && attendees.length < maxAttendees
