interface VersionGroup {
  label: string;
  versions: string[];
}

export const minecraftVersions: VersionGroup[] = [
  {
    label: "Select Version",
    versions: ["select"]
  },
  {
    label: "1.20.x: Trails & Tales",
    versions: ["1.20.4", "1.20.3", "1.20.2", "1.20.1", "1.20"]
  },
  {
    label: "1.19.x: The Wild Update",
    versions: ["1.19.4", "1.19.3", "1.19.2", "1.19.1", "1.19"]
  },
  {
    label: "1.18.x: Caves & Cliffs Part II",
    versions: ["1.18.2", "1.18.1", "1.18"]
  },
  {
    label: "1.17.x: Caves & Cliffs Part I",
    versions: ["1.17.1", "1.17"]
  },
  {
    label: "1.16.x: Nether Update",
    versions: ["1.16.5", "1.16.4", "1.16.3", "1.16.2", "1.16.1", "1.16"]
  },
  {
    label: "1.15.x: Buzzy Bees",
    versions: ["1.15.2", "1.15.1", "1.15"]
  },
  {
    label: "1.14.x: Village & Pillage",
    versions: ["1.14.4", "1.14.3", "1.14.2", "1.14.1", "1.14"]
  }
]; 