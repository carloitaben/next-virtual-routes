const context = {
  foo: "foo",
};

export default function Page() {
  return (
    <main>
      <pre>{JSON.stringify(context, null, 2)}</pre>
    </main>
  );
}
