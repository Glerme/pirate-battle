import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { MainMenu } from '../screens/MainMenu'
import { Options } from '../screens/Options'
import { Play } from '../screens/Play'
import { Result } from '../screens/Result'
import './app.css'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/options" element={<Options />} />
        <Route path="/play" element={<Play />} />
        <Route path="/result" element={<Result />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
