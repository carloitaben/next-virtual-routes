const route = {
  filename:
    "/Users/carloitaben/Developer/next-virtual-routes/examples/playground/src/app/(context-merging)/context/page.tsx",
  context: {
    foo: "foo",
  },
};

export default function Page() {
  return (
    <main>
      <pre>{JSON.stringify(route, null, 2)}</pre>
    </main>
  );
}
