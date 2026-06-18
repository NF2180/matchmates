import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import CreateMatch from './pages/CreateMatch'
import MatchDetail from './pages/MatchDetail'
import AttendanceDashboard from './pages/AttendanceDashboard'
import JoinMatch from './pages/JoinMatch'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/create" element={<CreateMatch />} />
      <Route path="/match/:id" element={<MatchDetail />} />
      <Route path="/match/:id/attendance" element={<AttendanceDashboard />} />
      <Route path="/join/:token" element={<JoinMatch />} />
    </Routes>
  )
}

export default App
