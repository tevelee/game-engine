interface Props {
  data: unknown;
}

export function JsonViewer({ data }: Props) {
  return (
    <div className="json-block">
      {JSON.stringify(data, null, 2)}
    </div>
  );
}
