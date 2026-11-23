const info = __BUILD_INFO__;

const builtOn = new Date(info.builtAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/** Shows which build is running: version, commit (linked on CI builds) and build date. */
export function VersionBadge() {
  const title = `Version ${info.version}${info.commit ? `, commit ${info.commit}` : ''}, built ${builtOn}`;
  return (
    <span className="version" title={title}>
      <span>v{info.version}</span>
      {info.commit && (
        <span className="version-detail">
          {' · '}
          {info.commitUrl
            ? <a href={info.commitUrl} target="_blank" rel="noreferrer">{info.commit}</a>
            : info.commit}
          {` · ${builtOn}`}
        </span>
      )}
    </span>
  );
}
