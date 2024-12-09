const context = {
  foo: "overriden",
  bar: "bar",
};

export default function Page() {
  return (
    <main>
      <pre>{JSON.stringify(context, null, 2)}</pre>
    </main>
  );
}
