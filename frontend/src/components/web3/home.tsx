'use client'

import { FC, useEffect, useState } from 'react'

import { ContractIds } from '@/deployments/deployments'
import {
  contractQuery,
  decodeOutput,
  useInkathon,
  useRegisteredContract,
} from '@scio-labs/use-inkathon'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface Meetup {
  id: number
  title: string
  location: string
  locationType: 'Online' | 'InPerson' // New field
  description: string
  timestamp: number
  price: number
  maxAttendees: number
  attendees: string[] | undefined
  status: string
  totalPaid: number
  host: string
}

interface HomeProps {
  onViewChange: (view: 'home' | 'create' | { details: number }) => void
}

export const Home: FC<HomeProps> = ({ onViewChange }) => {
  const { api } = useInkathon()
  const { contract } = useRegisteredContract(ContractIds.Meetup)
  const [meetups, setMeetups] = useState<Meetup[]>([])
  const [fetchIsLoading, setFetchIsLoading] = useState<boolean>(false)

  const decodeVecU8 = (vec: number[] | undefined) =>
    vec ? new TextDecoder().decode(new Uint8Array(vec)) : 'N/A'

  const fetchMeetups = async () => {
    if (!contract || !api) return

    setFetchIsLoading(true)
    try {
      const result = await contractQuery(api, '', contract, 'get_all_meetups', {}, [true])
      const { output, isError, decodedOutput } = decodeOutput(result, contract, 'get_all_meetups')

      if (isError) throw new Error(decodedOutput)

      const meetupsData = output || []
      const results: Meetup[] = meetupsData.map(([id, meetup]: [number, any]) => {
        const locationType = meetup.location_type?._enum || 'Online' // Default to 'Online' if undefined
        return {
          id,
          title: decodeVecU8(meetup.title),
          location: decodeVecU8(meetup.location),
          locationType: locationType === 'Online' ? 'Online' : 'InPerson',
          description: decodeVecU8(meetup.description),
          timestamp: parseInt(meetup.timestamp.replace(/,/g, '')),
          price: parseInt(meetup.price.replace(/,/g, '')),
          maxAttendees: parseInt(meetup.maxAttendees),
          attendees: meetup.attendees.map((attendee: any) => attendee.toString()),
          status: meetup.status?._enum || 'Planned', // Adjust for enum
          totalPaid: parseInt(meetup.totalPaid.replace(/,/g, '')),
          host: meetup.host.toString(),
        }
      })
      setMeetups(results)
    } catch (e) {
      console.error(e)
      toast.error('Error while fetching meetups. Try again…')
      setMeetups([])
    } finally {
      setFetchIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMeetups()
  }, [contract, api])

  const handleCreateMeetup = () => {
    onViewChange('create')
  }

  const handleViewDetails = (id: number) => {
    onViewChange({ details: id })
  }

  if (!api) return <div>Loading API...</div>

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <h2 className="text-center font-mono text-2xl text-gray-800">Active Meetups</h2>
      <Button
        onClick={handleCreateMeetup}
        className="bg-blue-500 font-bold text-white"
        disabled={fetchIsLoading}
      >
        Create Meetup
      </Button>
      {fetchIsLoading ? (
        <p>Loading meetups…</p>
      ) : meetups.length === 0 ? (
        <p>No active meetups found.</p>
      ) : (
        <div className="grid w-full max-w-2xl gap-4">
          {meetups.map((meetup) => (
            <Card key={meetup.id}>
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold">{meetup.title}</h3>
                <p className="text-sm text-gray-600">
                  {meetup.locationType}: {meetup.location}
                </p>
                <p className="text-sm text-gray-600">
                  Date: {new Date(meetup.timestamp).toLocaleString()}
                </p>
                <p className="text-sm text-gray-600">
                  Price: {(meetup.price / 1e18).toFixed(2)} SBY
                </p>
                <p className="text-sm text-gray-600">
                  Attendees: {meetup.attendees?.length || 0}/{meetup.maxAttendees}
                </p>
                <p className="text-sm text-gray-600">Status: {meetup.status}</p>
                <Button
                  onClick={() => handleViewDetails(meetup.id)}
                  className="mt-2 bg-blue-500 text-white"
                >
                  View Details
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-4 text-center font-mono text-xs text-gray-600">
        {contract ? contract.address.toString() : 'Loading contract…'}
      </p>
    </div>
  )
}
