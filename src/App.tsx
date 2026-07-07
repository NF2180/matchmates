import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'

const Home = lazy(() => import('./pages/Home'))
const CreateEvent = lazy(() => import('./pages/CreateEvent'))
const EventDetail = lazy(() => import('./pages/EventDetail'))
const AttendanceDashboard = lazy(() => import('./pages/AttendanceDashboard'))
const MatchDetail = lazy(() => import('./pages/MatchDetail'))
const TeamSetup = lazy(() => import('./pages/TeamSetup'))
const InningsSetup = lazy(() => import('./pages/InningsSetup'))
const LiveScoring = lazy(() => import('./pages/LiveScoring'))
const MatchScorecard = lazy(() => import('./pages/MatchScorecard'))
const AdminPlayers = lazy(() => import('./pages/AdminPlayers'))
const PlayerProfile = lazy(() => import('./pages/PlayerProfile'))
const JoinMatch = lazy(() => import('./pages/JoinMatch'))

export default function App() {
  return (
    <div className="flex flex-col min-h-screen">
      <Suspense fallback={<div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/event/create" element={<CreateEvent />} />
          <Route path="/event/:id" element={<EventDetail />} />
          <Route path="/event/:id/attendance" element={<AttendanceDashboard />} />
          <Route path="/match/:id" element={<MatchDetail />} />
          <Route path="/match/:id/teams" element={<TeamSetup />} />
          <Route path="/match/:id/innings/:inningsNum" element={<InningsSetup />} />
          <Route path="/match/:id/scoring/:inningsId" element={<LiveScoring />} />
          <Route path="/match/:id/scorecard" element={<MatchScorecard />} />
          <Route path="/admin/players" element={<AdminPlayers />} />
          <Route path="/player/:playerId" element={<PlayerProfile />} />
          <Route path="/join/:token" element={<JoinMatch />} />
        </Routes>
      </Suspense>
    </div>
  )
}
