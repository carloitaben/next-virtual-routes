const route = {
  filename:
    "/Users/carloitaben/Developer/next-virtual-routes/examples/playground/src/app/(context-merging)/context/nested/page.tsx",
  context: {
    foo: "overriden",
    bar: "bar",
  },
};

export default function Page() {
  return (
    <main>
      <pre>{JSON.stringify(route, null, 2)}</pre>
    </main>
  );
}
