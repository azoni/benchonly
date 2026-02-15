import { Link } from 'react-router-dom'
import usePageTitle from '../utils/usePageTitle'

export default function NotFoundPage() {
  usePageTitle('Page Not Found')

  return (
    <div className="min-h-screen bg-iron-950 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <p className="text-7xl font-bold text-flame-500 mb-4">404</p>
        <h1 className="text-2xl font-bold text-white mb-2">Page not found</h1>
        <p className="text-iron-400 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/today"
          className="inline-flex items-center gap-2 px-6 py-3 bg-flame-500 hover:bg-flame-600 text-white font-semibold rounded-xl transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  )
}
