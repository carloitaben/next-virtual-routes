export default function Page() {
  return (
    <main>
      <pre>{JSON.stringify(route, null, 2)}</pre>
    </main>
  )
}
