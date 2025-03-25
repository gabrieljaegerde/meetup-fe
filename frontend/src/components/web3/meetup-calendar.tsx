'use client'

import { FC, useEffect, useState } from 'react'

import { ContractIds } from '@/deployments/deployments'
import {
  contractQuery,
  decodeOutput,
  useInkathon,
  useRegisteredContract,
} from '@scio-labs/use-inkathon'
import { format } from 'date-fns'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'

interface Meetup {
  id: number
  title: string
  location: string
  locationType: 'Online' | 'InPerson' // New field
  timestamp: number
}

interface MeetupCalendarProps {
  onViewChange: (view: { details: number }) => void
}

export const MeetupCalendar: FC<MeetupCalendarProps> = ({ onViewChange }) => {
  const { api } = useInkathon()
  const { contract } = useRegisteredContract(ContractIds.Meetup)
  const [meetups, setMeetups] = useState<Meetup[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())

  const decodeVecU8 = (vec: number[] | undefined) =>
    vec ? new TextDecoder().decode(new Uint8Array(vec)) : 'N/A'

  useEffect(() => {
    const fetchMeetups = async () => {
      if (!contract || !api) return

      try {
        const result = await contractQuery(api, '', contract, 'get_all_meetups', {}, [true])
        const { output, isError, decodedOutput } = decodeOutput(result, contract, 'get_all_meetups')

        if (isError) throw new Error(decodedOutput)
        const meetupsData = output || []

        const results = meetupsData.map(([id, meetup]: [number, any]) => ({
          id,
          title: meetup.title,
          location: meetup.location,
          locationType: meetup.locationType === 'Online' ? 'Online' : 'InPerson', // Update to locationType
          timestamp: parseInt(meetup.timestamp.replace(/,/g, '')),
        }))
        setMeetups(results)
      } catch (e) {
        console.error(e)
        toast.error('Error loading calendar events')
      }
    }

    fetchMeetups()
  }, [contract, api])

  // Filter meetups for selected date
  const filteredMeetups = meetups.filter((meetup) =>
    selectedDate
      ? format(new Date(meetup.timestamp), 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')
      : false,
  )

  return (
    <div className="w-full rounded-lg bg-gray-100 p-4 shadow-md">
      <h2 className="mb-4 text-xl font-bold text-gray-900">Meetup Calendar</h2>

      <Calendar
        onChange={(date) => setSelectedDate(date as Date)}
        value={selectedDate}
        tileContent={({ date }) => {
          const eventExists = meetups.some(
            (meetup) =>
              format(new Date(meetup.timestamp), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd'),
          )
          return eventExists ? (
            <div className="rounded bg-blue-500 p-1 text-center text-xs text-white">🎉</div>
          ) : null
        }}
        className="w-full rounded-lg border border-gray-300 bg-white text-gray-900"
      />

      <div className="mt-4">
        <h3 className="text-lg font-semibold text-gray-900">
          {selectedDate ? format(selectedDate, 'MMMM dd, yyyy') : 'Select a date'}
        </h3>

        {filteredMeetups.length > 0 ? (
          <ul className="mt-2 divide-y divide-gray-300 rounded-lg bg-white p-4 shadow">
            {filteredMeetups.map((meetup) => (
              <li key={meetup.id} className="py-2">
                <h4 className="font-semibold text-gray-900">{meetup.title}</h4>
                <p className="text-sm text-gray-600">
                  {meetup.locationType}: {meetup.location}
                </p>
                <Button
                  onClick={() => onViewChange({ details: meetup.id })}
                  className="mt-2 rounded-md bg-blue-500 px-3 py-1 text-sm text-white"
                >
                  View Details
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No events on this date.</p>
        )}
      </div>
    </div>
  )
}
