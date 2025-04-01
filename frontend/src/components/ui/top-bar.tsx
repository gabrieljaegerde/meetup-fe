'use client';

import { ConnectButton } from '@/components/web3/connect-button';
import Link from 'next/link';

type Tab = 'home' | 'calendar' | 'my-meetups';

interface TopBarProps {
    activeTab: Tab;
    onTabChange: (tab: Tab) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ activeTab, onTabChange }) => {
    const tabs: { id: Tab; label: string }[] = [
        { id: 'home', label: 'Home' },
        { id: 'calendar', label: 'Calendar' },
        { id: 'my-meetups', label: 'My Meetups' },
    ];

    return (
        <header className="sticky top-0 z-10 flex items-center justify-between bg-white p-4 shadow">
            <Link href="/" className="font-mono text-2xl font-bold text-gray-800">
                MeetDot
            </Link>
            <div className="flex items-center gap-4">
                <nav className="flex gap-2">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={`rounded px-3 py-1 font-medium ${activeTab === tab.id ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
                <Link href="/create" className="rounded bg-green-500 px-3 py-1 text-white hover:bg-green-600">
                    Create Meetup
                </Link>
                <ConnectButton />
            </div>
        </header>
    );
};