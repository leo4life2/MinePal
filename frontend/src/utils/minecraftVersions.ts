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
    label: "1.21.x: Tricky Trials",
    versions: ["1.21.4", "1.21.3", "1.21.1", "1.21"]
  },
  {
    label: "1.20.x: Trails & Tales",
    versions: ["1.20.6", "1.20.5", "1.20.4", "1.20.3", "1.20.2", "1.20.1", "1.20"]
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
    versions: ["1.17.1", "1.17", "21w07a"]
  },
  {
    label: "1.16.x: Nether Update",
    versions: ["1.16.5", "1.16.4", "1.16.3", "1.16.2", "1.16.1", "1.16", "1.16-rc1", "20w14a", "20w13b"]
  },
  {
    label: "1.15.x: Buzzy Bees",
    versions: ["1.15.2", "1.15.1", "1.15"]
  },
  {
    label: "1.14.x: Village & Pillage",
    versions: ["1.14.4", "1.14.3", "1.14.1", "1.14"]
  },
  {
    label: "1.13.x: Update Aquatic",
    versions: ["1.13.2", "1.13.2-pre2", "1.13.2-pre1", "1.13.1", "1.13", "17w50a"]
  },
  {
    label: "1.12.x: World of Color Update",
    versions: ["1.12.2", "1.12.1", "1.12", "1.12-pre4", "17w18b", "17w15a"]
  },
  {
    label: "1.11.x: Exploration Update",
    versions: ["1.11.2", "1.11", "16w35a"]
  },
  {
    label: "1.10.x: Frostburn Update",
    versions: ["1.10.2", "1.10.1", "1.10", "1.10-pre1", "16w20a"]
  },
  {
    label: "1.9.x: Combat Update",
    versions: ["1.9.4", "1.9.2", "1.9.1-pre2", "1.9", "15w40b"]
  },
  {
    label: "1.8.x: Bountiful Update",
    versions: ["1.8.8"]
  }
]; 