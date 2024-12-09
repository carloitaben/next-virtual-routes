const context = {
  foo: "overriden",
  bar: "overriden",
};

export default function Page() {
  return (
    <main>
      <pre>{JSON.stringify(context, null, 2)}</pre>
    </main>
  );
}
