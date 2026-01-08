// app/manifest.ts
import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Smart Scheduler',
    short_name: 'Scheduler',
    description: 'Team AI Scheduler',
    start_url: '/',
    display: 'standalone', // ★これでアドレスバーが消えます！
    background_color: '#ffffff',
    theme_color: '#9333ea', // テーマカラー（紫）
    icons: [
      {
        src: '/icon.png', // 次のステップで用意します
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}