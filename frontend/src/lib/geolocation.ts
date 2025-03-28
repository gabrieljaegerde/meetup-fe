import { Coordinates } from '@/types/meetup'

export const getUserLocation = (): Promise<Coordinates> =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) reject(new Error('Geolocation not supported'))
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(err),
    )
  })

export const getAddressFromCoords = async (location: string): Promise<string> => {
  if (!location.includes(',')) return location
  const [lat, lng] = location.split(',').map(Number)
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { headers: { 'User-Agent': 'MeetupChain/1.0' } },
    )
    const data = await response.json()
    return data.display_name || `${lat}, ${lng}`
  } catch (e) {
    console.warn(`Failed to reverse geocode ${location}:`, e)
    return `${lat}, ${lng}`
  }
}
