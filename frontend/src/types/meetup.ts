export interface Meetup {
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

export interface Coordinates {
  latitude: number
  longitude: number
}
