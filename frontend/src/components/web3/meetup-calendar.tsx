'use client'

import { FC, useEffect, useState } from 'react'

import { useInkathon } from '@scio-labs/use-inkathon'
import { format, isSameDay } from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'

import { MeetupCard } from '@/components/ui/meetup-card'
import { Meetup } from '@/types/meetup'
import { cn } from '@/utils/cn'

interface MeetupCalendarProps {
  meetups: Meetup[]
  fetchIsLoading?: boolean
  onViewChange: (view: { details: number }) => void
}

export const MeetupCalendar: FC<MeetupCalendarProps> = ({
  meetups,
  fetchIsLoading = false,
  onViewChange,
}) => {
  const { api } = useInkathon()
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [decimals, setDecimals] = useState<number>(12)
  const [tokenSymbol, setTokenSymbol] = useState<string>('DOT')
  const [userTimezone] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone)

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

  const tileContent = ({ date }: { date: Date }) => {
    const dayMeetups = meetups.filter((meetup) => isSameDay(new Date(meetup.timestamp), date))
    if (dayMeetups.length === 0) return null

    const onlineCount = dayMeetups.filter((m) => m.locationType === 'Online').length
    const inPersonCount = dayMeetups.filter((m) => m.locationType === 'InPerson').length

    return (
      <div className="absolute right-1 top-1 flex gap-1 text-[0.5rem] text-gray-700">
        {onlineCount > 0 && (
          <span className="py-0.25 inline-block rounded-full bg-indigo-100 px-1 text-indigo-800">
            {onlineCount} 🌐
          </span>
        )}
        {inPersonCount > 0 && (
          <span className="py-0.25 inline-block rounded-full bg-green-100 px-1 text-green-800">
            {inPersonCount} 📍
          </span>
        )}
      </div>
    )
  }

  const tileClassName = ({ date }: { date: Date }) => {
    const dayMeetups = meetups.filter((meetup) => isSameDay(new Date(meetup.timestamp), date))
    if (dayMeetups.length === 0) return ''
    const hasOnline = dayMeetups.some((m) => m.locationType === 'Online')
    const hasInPerson = dayMeetups.some((m) => m.locationType === 'InPerson')
    return cn(
      'relative rounded-full h-full flex items-center justify-center',
      hasOnline && hasInPerson
        ? 'bg-gradient-to-r from-indigo-50 to-green-50'
        : hasOnline
          ? 'bg-indigo-50'
          : 'bg-green-50',
    )
  }

  const filteredMeetups = meetups.filter((meetup) =>
    selectedDate ? isSameDay(new Date(meetup.timestamp), selectedDate) : false,
  )

  return (
    <div className="w-full space-y-6 rounded-xl bg-gray-100 p-6 shadow-lg">
      <h2 className="mb-4 text-4xl font-extrabold text-gray-900">Meetup Calendar</h2>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Calendar Section */}
        <div className="w-full lg:w-1/2">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <Calendar
              onChange={(date) => setSelectedDate(date as Date)}
              value={selectedDate}
              tileClassName={tileClassName}
              tileContent={tileContent}
              className="w-full border-0 p-6 text-xl text-gray-800"
              navigationLabel={({ date }) => (
                <span className="text-2xl font-semibold">{format(date, 'MMMM yyyy')}</span>
              )}
            />
            <style jsx>{`
              :global(.react-calendar) {
                width: 100% !important;
                min-width: 550px !important;
                min-height: 550px !important;
                max-width: none !important;
                border: none !important;
                background: transparent !important;
              }
              :global(.react-calendar__month-view) {
                width: 100%;
                height: calc(100% - 60px);
                display: flex;
                flex-direction: column;
              }
              :global(.react-calendar__month-view__days) {
                flex: 1;
                display: grid;
                grid-template-columns: repeat(7, 1fr);
                grid-template-rows: repeat(6, 1fr);
                gap: 10px;
                padding: 8px;
              }
              :global(.react-calendar__tile) {
                width: 100%;
                height: 100%;
                min-width: 70px;
                min-height: 70px;
                padding: 8px;
                font-size: 1.25rem;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
              }
              :global(.react-calendar__navigation) {
                margin-bottom: 20px;
                height: 60px;
              }
              :global(.react-calendar__navigation button) {
                font-size: 1.5rem;
                padding: 10px 20px;
              }
            `}</style>
          </div>
        </div>

        {/* Meetup Tiles Section */}
        <div className="flex w-full flex-col lg:w-1/2">
          <h3 className="mb-4 text-2xl font-bold text-gray-800">
            {selectedDate ? format(selectedDate, 'MMMM dd, yyyy') : 'Select a date'}
          </h3>
          {fetchIsLoading ? (
            <div className="flex-1 space-y-6">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {Array(4)
                  .fill(0)
                  .map((_, i) => (
                    <div
                      key={i}
                      className="h-[380px] animate-pulse rounded-xl bg-gray-200 shadow-md"
                    />
                  ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence>
                {filteredMeetups.length > 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-1 gap-6 sm:grid-cols-2"
                  >
                    {filteredMeetups.map((meetup) => (
                      <MeetupCard
                        key={meetup.id}
                        meetup={meetup}
                        decimals={decimals}
                        tokenSymbol={tokenSymbol}
                        userTimezone={userTimezone}
                        onViewChange={onViewChange}
                      />
                    ))}
                  </motion.div>
                ) : (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-8 text-center text-lg italic text-gray-600"
                  >
                    No events on this date.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
