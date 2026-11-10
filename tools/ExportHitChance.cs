// Writes data/hit-chance.json, the one data file behind the hit chance page, from the hit lab's results in a
// theorycrafter checkout:
//
//   HitData/curve/steps.tsv   one row per result: an attacker's AR against a defender's defense at one slider
//                             setting, with how many swings were made and how many landed
//
// Only the numbers are read: AR, defense, the two sliders, swings and landed. Who swung, the notes and everything
// else in that folder (logs, plans) are left where they are.
//
//   dotnet run ExportHitChance.cs -- "PATH\TO\ao-theorycrafter" "..\data\hit-chance.json"

using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

if (args.Length != 2)
{
    Console.Error.WriteLine("usage: dotnet run ExportHitChance.cs -- <theorycrafter checkout> <output .json>");
    return 2;
}
string repo = args[0], output = args[1];
var inv = CultureInfo.InvariantCulture;

string source = Path.Combine(repo, "HitData", "curve", "steps.tsv");
string[] lines = File.ReadAllLines(source);
string[] header = lines[0].Split('\t');
int Column(string name)
{
    int at = Array.IndexOf(header, name);
    if (at < 0) throw new InvalidDataException($"steps.tsv: no column {name}");
    return at;
}
int ar = Column("ar"), def = Column("dr"), slider = Column("defender_slider"), own = Column("attacker_slider"),
    swings = Column("swings"), landed = Column("landed");

var results = new List<(int Ar, int Def, int Slider, int Own, int Swings, int Landed)>();
for (int i = 1; i < lines.Length; i++)
{
    if (lines[i].Length == 0) continue;
    string[] cells = lines[i].Split('\t');
    int Number(int column) => int.Parse(cells[column], NumberStyles.AllowLeadingSign, inv);
    var row = (Number(ar), Number(def), Number(slider), Number(own), Number(swings), Number(landed));
    if (row.Item5 == 0) continue; // a step that was planned and never run
    if (row.Item1 <= 0 || row.Item2 <= 0) throw new InvalidDataException($"steps.tsv line {i + 1}: AR and defense must be above 0");
    if (row.Item6 > row.Item5) throw new InvalidDataException($"steps.tsv line {i + 1}: more landed than swung");
    results.Add(row);
}
if (results.Count == 0) throw new InvalidDataException("steps.tsv: no results");

// In order along the chart: by AR over defense, then by the defender's slider.
results.Sort((a, b) =>
{
    int byRatio = ((double)a.Ar / a.Def).CompareTo((double)b.Ar / b.Def);
    return byRatio != 0 ? byRatio : a.Slider != b.Slider ? a.Slider.CompareTo(b.Slider) : a.Def.CompareTo(b.Def);
});

// The commit the results were read at, when the folder is a git checkout.
string? commit = null;
try
{
    var git = Process.Start(new ProcessStartInfo("git", "rev-parse --short HEAD")
        { WorkingDirectory = repo, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false })!;
    string text = git.StandardOutput.ReadToEnd().Trim();
    git.WaitForExit();
    if (git.ExitCode == 0 && Regex.IsMatch(text, "^[0-9a-f]{7,40}$")) commit = text;
}
catch { /* no git: the file just doesn't name a commit */ }

// Written by hand rather than by a serializer so that a new result shows up as a one-line change.
var json = new StringBuilder();
json.Append("{\n");
json.Append($"  \"updated\": \"{DateTime.UtcNow:yyyy-MM-dd}\",\n");
if (commit != null) json.Append($"  \"sourceCommit\": \"{commit}\",\n");
json.Append("  \"results\": [\n");
for (int i = 0; i < results.Count; i++)
{
    var r = results[i];
    json.Append($"    {{ \"ar\": {r.Ar}, \"def\": {r.Def}, \"slider\": {r.Slider}, \"attackerSlider\": {r.Own}, " +
                $"\"swings\": {r.Swings}, \"landed\": {r.Landed} }}{(i < results.Count - 1 ? "," : "")}\n");
}
json.Append("  ]\n}\n");

Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output))!);
File.WriteAllText(output, json.ToString(), new UTF8Encoding(false));
Console.WriteLine($"{output}: {results.Count} results, {results.Sum(r => r.Swings):N0} swings" + (commit != null ? $", from {commit}" : ""));
return 0;
