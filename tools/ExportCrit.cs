// Writes data/crit.json, the one data file behind the crit page, from the hit lab's results in a theorycrafter
// checkout. Every hit lab plan whose characters' Critical Increase is given counts:
//
//   HitData/<plan>.json         the plan: each character's Critical Increase, or a step's own for one side
//   HitData/<plan>/steps.tsv    one row per result: an attacker's AR against a defender's defense at one slider
//                               setting, with how many swings landed and how many of those crit
//
// A few results are left out by name (leftOut, below).
//
// Only the numbers are read: AR, defense, the defender's slider, the attacker's Critical Increase, landed and crits.
// Who swung, the notes and everything else in that folder (logs, plans' other fields) are left where they are.
//
//   dotnet run ExportCrit.cs -- "PATH\TO\ao-theorycrafter" "..\data\crit.json"

using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

if (args.Length != 2)
{
    Console.Error.WriteLine("usage: dotnet run ExportCrit.cs -- <theorycrafter checkout> <output .json>");
    return 2;
}
string repo = args[0], output = args[1];
var inv = CultureInfo.InvariantCulture;
var jsonOptions = new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true };

// Results left out of the page, by plan, step and direction: the crit test's one result at Critical Increase 21.
var leftOut = new HashSet<(string Plan, string Step, string Direction)> { ("crit", "2", "YouHitThem") };

double? CritIncreaseOf(JsonElement side) =>
    side.ValueKind == JsonValueKind.Object && side.TryGetProperty("CritIncrease", out var ci) && ci.ValueKind == JsonValueKind.Number
        ? ci.GetDouble() : null;

var results = new List<(int Ar, int Def, int Slider, double CritIncrease, int Landed, int Crits)>();
var plansRead = new List<string>();
string hitData = Path.Combine(repo, "HitData");
foreach (string planPath in Directory.GetFiles(hitData, "*.json").Order(StringComparer.Ordinal))
{
    if (planPath.EndsWith(".session.json", StringComparison.OrdinalIgnoreCase)) continue;
    string name = Path.GetFileNameWithoutExtension(planPath);
    string stepsPath = Path.Combine(hitData, name, "steps.tsv");
    if (!File.Exists(stepsPath)) continue;

    using var plan = JsonDocument.Parse(File.ReadAllText(planPath), jsonOptions);
    var root = plan.RootElement;
    if (!root.TryGetProperty("Steps", out var steps)) continue;
    double? you = root.TryGetProperty("You", out var y) ? CritIncreaseOf(y) : null;
    double? them = root.TryGetProperty("Them", out var t) ? CritIncreaseOf(t) : null;
    // The attacker's Critical Increase in each step and direction: the step's own for that side, else the character's.
    var critIncrease = new Dictionary<(string Step, string Direction), double?>();
    foreach (var step in steps.EnumerateArray())
    {
        string id = step.GetProperty("Id").GetString()!;
        critIncrease[(id, "YouHitThem")] = (step.TryGetProperty("You", out var s1) ? CritIncreaseOf(s1) : null) ?? you;
        critIncrease[(id, "TheyHitYou")] = (step.TryGetProperty("Them", out var s2) ? CritIncreaseOf(s2) : null) ?? them;
    }
    if (critIncrease.Values.All(v => v is null)) continue; // a plan that doesn't give Critical Increase has no crit results

    string[] lines = File.ReadAllLines(stepsPath);
    string[] header = lines[0].Split('\t');
    int Column(string column)
    {
        int at = Array.IndexOf(header, column);
        if (at < 0) throw new InvalidDataException($"{name}/steps.tsv: no column {column}");
        return at;
    }
    int stepColumn = Column("step"), direction = Column("direction"), ar = Column("ar"), def = Column("dr"),
        slider = Column("defender_slider"), landed = Column("landed"), crits = Column("crits");
    int before = results.Count;
    for (int i = 1; i < lines.Length; i++)
    {
        if (lines[i].Length == 0) continue;
        string[] cells = lines[i].Split('\t');
        int Number(int column) => int.Parse(cells[column], NumberStyles.AllowLeadingSign, inv);
        if (leftOut.Contains((name, cells[stepColumn], cells[direction]))) continue;
        if (!critIncrease.TryGetValue((cells[stepColumn], cells[direction]), out var ci) || ci is not double critInc) continue;
        var row = (Number(ar), Number(def), Number(slider), critInc, Number(landed), Number(crits));
        if (row.Item5 == 0) continue; // nothing landed: a step that was planned and never run, or no crit to count
        if (row.Item1 <= 0 || row.Item2 <= 0) throw new InvalidDataException($"{name}/steps.tsv line {i + 1}: AR and defense must be above 0");
        if (row.Item6 > row.Item5) throw new InvalidDataException($"{name}/steps.tsv line {i + 1}: more crits than landed");
        results.Add(row);
    }
    if (results.Count > before) plansRead.Add(name);
}
if (results.Count == 0) throw new InvalidDataException("HitData: no plan gives its characters' Critical Increase");

// The hit formula before it's held to 0..100%, the same as the hit chance page's, to put the results in order along
// the chart: by it, then by Critical Increase.
static double HitFormula(int ar, int def, int slider) => 0.5 + (double)(ar - def) / (def + Math.Abs(ar - def)) + (slider + 100) / 500.0;
results.Sort((a, b) =>
{
    int byFormula = HitFormula(a.Ar, a.Def, a.Slider).CompareTo(HitFormula(b.Ar, b.Def, b.Slider));
    return byFormula != 0 ? byFormula : a.CritIncrease != b.CritIncrease ? a.CritIncrease.CompareTo(b.CritIncrease) : a.Def.CompareTo(b.Def);
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
    json.Append($"    {{ \"ar\": {r.Ar}, \"def\": {r.Def}, \"slider\": {r.Slider}, \"critIncrease\": {r.CritIncrease.ToString(inv)}, " +
                $"\"landed\": {r.Landed}, \"crits\": {r.Crits} }}{(i < results.Count - 1 ? "," : "")}\n");
}
json.Append("  ]\n}\n");

Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output))!);
File.WriteAllText(output, json.ToString(), new UTF8Encoding(false));
Console.WriteLine($"{output}: {results.Count} results from {plansRead.Count} plans ({string.Join(", ", plansRead)}), " +
                  $"{results.Sum(r => r.Crits):N0} crits in {results.Sum(r => r.Landed):N0} landed" + (commit != null ? $", from {commit}" : ""));
return 0;
