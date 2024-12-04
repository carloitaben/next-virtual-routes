const route = {
  filename:
    "/Users/carloitaben/Developer/next-virtual-routes/examples/playground/src/app/(context-merging)/context/nested/deeply/page.tsx",
  context: {
    foo: "overriden",
    bar: "overriden",
  },
};

export default function Page() {
  return (
    <main>
      <pre>{JSON.stringify(route, null, 2)}</pre>
    </main>
  );
}
