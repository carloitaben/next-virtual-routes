import type { Metadata } from "next"
import "@/globals.css"

export const metadata: Metadata = {
  title: route.context.language,
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
