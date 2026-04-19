import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'tDraw',
    short_name: 'tDraw',
    description: 'The premium iPad-first note-taking experience.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#FAF7F0',
    theme_color: '#0071E3',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
