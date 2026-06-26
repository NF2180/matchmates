import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'

const Home = lazy(() => import('./pages/Home'))
const CreateMatch = lazy(() => import('./pages/CreateMatch'))
const MatchDetail = lazy(() => import('./pages/MatchDetail'))
const AttendanceDashboard = lazy(() => import('./pages/AttendanceDashboard'))
const JoinMatch = lazy(() => import('./pages/JoinMatch'))
const AdminPlayers = lazy(() => import('./pages/AdminPlayers'))
const TeamSetup = lazy(() => import('./pages/TeamSetup'))
const InningsSetup = lazy(() => import('./pages/InningsSetup'))
const LiveScoring = lazy(() => import('./pages/LiveScoring'))
const MatchScorecard = lazy(() => import('./pages/MatchScorecard'))
const DuplicateMatch = lazy(() => import('./pages/DuplicateMatch'))
const PlayerProfile = lazy(() => import('./pages/PlayerProfile'))

function App() {
  return (
    <Suspense fallback={<div className="text-zinc-500 text-sm py-12 text-center">Loading…</div>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateMatch />} />
        <Route path="/match/:id" element={<MatchDetail />} />
        <Route path="/match/:id/attendance" element={<AttendanceDashboard />} />
        <Route path="/match/:id/teams" element={<TeamSetup />} />
        <Route path="/match/:id/innings/:inningsNum" element={<InningsSetup />} />
        <Route path="/match/:id/scoring/:inningsId/:strikerId/:nonStrikerId/:bowlerId" element={<LiveScoring />} />
        <Route path="/match/:id/scoring/:inningsId" element={<LiveScoring />} />
        <Route path="/match/:id/scorecard" element={<MatchScorecard />} />
        <Route path="/match/:id/duplicate" element={<DuplicateMatch />} />
        <Route path="/player/:playerId" element={<PlayerProfile />} />
        <Route path="/join/:token" element={<JoinMatch />} />
        <Route path="/admin/players" element={<AdminPlayers />} />
      </Routes>
    </Suspense>
  )
}

export default App
