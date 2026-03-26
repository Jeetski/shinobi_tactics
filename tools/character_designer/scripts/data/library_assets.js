function parseLibraryAsset(rawText, sourcePath) {
  const asset = JSON.parse(rawText);
  return {
    ...asset,
    source_path: sourcePath,
  };
}

const libraryModules = import.meta.glob("../../library/**/*.yml", {
  query: "?raw",
  import: "default",
  eager: true,
});

export const LIBRARY_ASSETS = Object.entries(libraryModules)
  .map(([sourcePath, rawText]) => parseLibraryAsset(rawText, sourcePath))
  .sort((left, right) => left.id.localeCompare(right.id));

export const LIBRARY_ASSET_MAP = new Map(LIBRARY_ASSETS.map((asset) => [asset.id, asset]));
