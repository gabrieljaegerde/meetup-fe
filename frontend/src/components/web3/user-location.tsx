'use client'

import { FC, useEffect, useState } from 'react'

export const UserLocation: FC = () => {
  const [location, setLocation] = useState<string>('Fetching location...')

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation('Geolocation not supported')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setLocation(`Lat: ${latitude.toFixed(2)}, Lng: ${longitude.toFixed(2)}`)
      },
      () => {
        setLocation('Unable to fetch location')
      },
    )
  }, [])

  return <div className="text-sm text-gray-700">{location}</div>
}
