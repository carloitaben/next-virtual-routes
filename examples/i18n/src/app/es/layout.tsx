const route = {
  "filename": "/Users/carloitaben/Developer/next-virtual-routes/examples/i18n/src/app/es/layout.tsx",
  "context": {
    "language": "es"
  }
}

import type { Metadata } from "next"
import "@/globals.css"

export const metadata: Metadata = {
  "title": "es"
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang={route.context.language}>
      <body>
        <h1>Language: {route.context.language}</h1>
        {children}
      </body>
    </html>
  )
}
