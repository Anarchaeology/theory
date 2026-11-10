// Writes data/ar-multiplier.json, the one data file behind the AR multiplier page, from the theorycrafter's own
// tables, so the page and the app can't drift apart:
//
//   AOTheorycrafter/Calc/MeasuredArCurves.cs   each measured profession's (AR, multiplier) points
//   AOTheorycrafter/Calc/DpmCalculator.cs      the old number for every profession (ProfScale) and the soft cap
//
// Only those numbers are read. Nothing about the tests (characters, weapons, logs) is read or written.
//
//   dotnet run ExportArMultiplier.cs -- "PATH\TO\ao-theorycrafter" "..\data\ar-multiplier.json"

using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

if (args.Length != 2)
{
    Console.Error.WriteLine("usage: dotnet run ExportArMultiplier.cs -- <theorycrafter checkout> <output .json>");
    return 2;
}
string repo = args[0], output = args[1];
var inv = CultureInfo.InvariantCulture;

string calc = File.ReadAllText(Path.Combine(repo, "AOTheorycrafter", "Calc", "DpmCalculator.cs"));
string curves = File.ReadAllText(Path.Combine(repo, "AOTheorycrafter", "Calc", "MeasuredArCurves.cs"));

double Constant(string name)
{
    Match m = Regex.Match(calc, $@"const\s+double\s+{name}\s*=\s*([\d.]+)\s*;");
    if (!m.Success) throw new InvalidDataException($"DpmCalculator.cs: no constant {name}");
    return double.Parse(m.Groups[1].Value, inv);
}
double softCap = Constant("ArSoftCap"), atSoftCap = Constant("ArMultiplierAtSoftCap"), arPerPoint = Constant("ArPerMultiplierPoint");

// The old numbers: the arms of ProfScale's switch, in the order written there.
Match scale = Regex.Match(calc, @"double\s+ProfScale\s*\(Profession\s+\w+\)\s*=>\s*\w+\s+switch\s*\{(.*?)\};", RegexOptions.Singleline);
if (!scale.Success) throw new InvalidDataException("DpmCalculator.cs: ProfScale not found");
var old = new List<(string Key, string Number)>();
foreach (Match m in Regex.Matches(scale.Groups[1].Value, @"Profession\.(\w+)\s*=>\s*([\d.]+)\s*,"))
    old.Add((m.Groups[1].Value, m.Groups[2].Value));
if (old.Count != 14) throw new InvalidDataException($"ProfScale: expected 14 professions, found {old.Count}");

// The measured curves: every "public static readonly Point[] Name = { new(ar, multiplier), ... };".
var measured = new Dictionary<string, List<(string Ar, string Multiplier)>>();
foreach (Match table in Regex.Matches(curves, @"public\s+static\s+readonly\s+Point\[\]\s+(\w+)\s*=\s*\{(.*?)\};", RegexOptions.Singleline))
{
    var points = new List<(string, string)>();
    double lastAr = softCap;
    foreach (Match p in Regex.Matches(table.Groups[2].Value, @"new\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)"))
    {
        double ar = double.Parse(p.Groups[1].Value, inv), multiplier = double.Parse(p.Groups[2].Value, inv);
        if (ar <= lastAr) throw new InvalidDataException($"{table.Groups[1].Value}: AR {ar} is not above the point before it");
        if (multiplier < atSoftCap) throw new InvalidDataException($"{table.Groups[1].Value}: {multiplier} at AR {ar} is under the soft cap's {atSoftCap}");
        lastAr = ar;
        points.Add((p.Groups[1].Value, p.Groups[2].Value));
    }
    if (points.Count == 0) throw new InvalidDataException($"{table.Groups[1].Value}: no points");
    measured[table.Groups[1].Value] = points;
}
foreach (string key in measured.Keys)
    if (!old.Any(s => s.Key == key)) throw new InvalidDataException($"{key} has a curve but no old number");

// The game's own spelling of the three two-word professions.
string Name(string key) => key switch
{
    "MartialArtist" => "Martial Artist",
    "MetaPhysicist" => "Meta-Physicist",
    "NanoTechnician" => "Nano-Technician",
    _ => key,
};
string Id(string key) => Name(key).ToLowerInvariant().Replace(' ', '-');

// The commit the tables were read at, when the folder is a git checkout.
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

// Written by hand rather than by a serializer so that a new reading shows up as a one-line change.
var json = new StringBuilder();
json.Append("{\n");
json.Append($"  \"updated\": \"{DateTime.UtcNow:yyyy-MM-dd}\",\n");
if (commit != null) json.Append($"  \"sourceCommit\": \"{commit}\",\n");
json.Append($"  \"softCap\": {{ \"ar\": {softCap.ToString(inv)}, \"multiplier\": {atSoftCap.ToString(inv)}, \"arPerPoint\": {arPerPoint.ToString(inv)} }},\n");
json.Append("  \"professions\": [\n");
for (int i = 0; i < old.Count; i++)
{
    (string key, string number) = old[i];
    json.Append($"    {{ \"id\": \"{Id(key)}\", \"name\": \"{Name(key)}\", \"old\": {number}, \"points\": [");
    if (measured.TryGetValue(key, out var points))
    {
        for (int p = 0; p < points.Count; p++)
        {
            json.Append(p % 6 == 0 ? "\n      " : " ");
            json.Append($"[{points[p].Ar}, {points[p].Multiplier}]{(p < points.Count - 1 ? "," : "")}");
        }
        json.Append("\n    ");
    }
    json.Append($"] }}{(i < old.Count - 1 ? "," : "")}\n");
}
json.Append("  ]\n}\n");

Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output))!);
File.WriteAllText(output, json.ToString(), new UTF8Encoding(false));
Console.WriteLine($"{output}: {measured.Count} measured of {old.Count} professions, {measured.Values.Sum(p => p.Count)} points" +
                  (commit != null ? $", from {commit}" : ""));
return 0;
