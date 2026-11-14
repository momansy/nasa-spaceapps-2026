using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using MissionForge.Net;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;

namespace MissionForge.Tests.Net
{
    /// <summary>
    /// Keeps the C# mirror in <see cref="ProtocolNames"/> and RoomModels.cs identical to the wire
    /// contract in <c>protocol/schema/</c> at the repository root (one <c>&lt;type&gt;.schema.json</c>
    /// per message type, plus <c>envelope.schema.json</c>).
    /// </summary>
    public sealed class ProtocolContractTests
    {
        private const string SchemaSuffix = ".schema.json";
        private const string EnvelopeSchema = "envelope";

        /// <summary>repo root = Application.dataPath/../../.. (Assets -> MissionForge -> unity -> root).</summary>
        private static string SchemaDirectory
        {
            get { return Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "..", "protocol", "schema")); }
        }

        private static HashSet<string> SchemaMessageTypes()
        {
            string dir = SchemaDirectory;
            Assert.IsTrue(Directory.Exists(dir), "protocol/schema not found at " + dir);
            var types = new HashSet<string>(StringComparer.Ordinal);
            foreach (string file in Directory.GetFiles(dir, "*" + SchemaSuffix))
            {
                string name = Path.GetFileName(file);
                string type = name.Substring(0, name.Length - SchemaSuffix.Length);
                if (type != EnvelopeSchema)
                {
                    types.Add(type);
                }
            }

            return types;
        }

        /// <summary>Values of every <c>public const string</c> field declared directly on <paramref name="type"/>.</summary>
        private static Dictionary<string, string> ConstStrings(Type type)
        {
            return type.GetFields(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
                .Where(field => field.IsLiteral && !field.IsInitOnly && field.FieldType == typeof(string))
                .ToDictionary(field => field.Name, field => (string)field.GetRawConstantValue());
        }

        private static JObject LoadSchema(string messageType)
        {
            string path = Path.Combine(SchemaDirectory, messageType + SchemaSuffix);
            Assert.IsTrue(File.Exists(path), "missing schema " + path);
            return JObject.Parse(File.ReadAllText(path));
        }

        /// <summary>Follows a local <c>#/$defs/X</c> reference, if any.</summary>
        private static JObject Resolve(JObject schema, JObject node)
        {
            var reference = (string)node["$ref"];
            if (reference == null)
            {
                return node;
            }

            const string prefix = "#/$defs/";
            Assert.IsTrue(reference.StartsWith(prefix, StringComparison.Ordinal), "unexpected $ref " + reference);
            return (JObject)schema["$defs"][reference.Substring(prefix.Length)];
        }

        /// <summary>Selects a node by a slash path such as <c>$defs/PlayerInfo</c> or <c>properties/step/anyOf/0</c>; "" is the root.</summary>
        private static JObject Select(JObject schema, string path)
        {
            JToken node = schema;
            if (path.Length == 0)
            {
                return schema;
            }

            foreach (string segment in path.Split('/'))
            {
                var array = node as JArray;
                JToken next = array != null ? array[int.Parse(segment)] : node[segment];
                Assert.IsNotNull(next, "schema path not found: " + path);
                var obj = next as JObject;
                node = obj != null ? Resolve(schema, obj) : next;
            }

            var result = node as JObject;
            Assert.IsNotNull(result, "schema path is not an object: " + path);
            return result;
        }

        private static HashSet<string> JsonPropertyNames(Type dto)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (FieldInfo field in dto.GetFields(BindingFlags.Public | BindingFlags.Instance))
            {
                var attribute = field.GetCustomAttribute<JsonPropertyAttribute>();
                Assert.IsNotNull(attribute, dto.Name + "." + field.Name + " has no [JsonProperty]");
                names.Add(attribute.PropertyName);
            }

            return names;
        }

        [Test]
        public void EveryMessageConstant_HasASchemaFile()
        {
            HashSet<string> schemaTypes = SchemaMessageTypes();
            Dictionary<string, string> constants = ConstStrings(typeof(ProtocolNames.Messages));

            Assert.IsNotEmpty(constants);
            foreach (KeyValuePair<string, string> constant in constants)
            {
                Assert.IsTrue(
                    schemaTypes.Contains(constant.Value),
                    "ProtocolNames.Messages." + constant.Key + " = \"" + constant.Value + "\" has no protocol/schema/" + constant.Value + SchemaSuffix);
            }
        }

        [Test]
        public void EverySchemaFile_HasAMessageConstant()
        {
            var constants = new HashSet<string>(ConstStrings(typeof(ProtocolNames.Messages)).Values, StringComparer.Ordinal);

            List<string> missing = SchemaMessageTypes().Where(type => !constants.Contains(type)).OrderBy(type => type).ToList();

            Assert.IsEmpty(missing, "message types without a ProtocolNames.Messages constant: " + string.Join(", ", missing));
        }

        [Test]
        public void MessageConstants_AreUnique()
        {
            List<string> values = ConstStrings(typeof(ProtocolNames.Messages)).Values.ToList();

            Assert.AreEqual(values.Count, values.Distinct().Count(), "two constants share a message type");
        }

        /// <summary>DTO type, schema file and path of the object it mirrors: field names must match exactly.</summary>
        private static readonly object[] DtoCases =
        {
            new object[] { typeof(HelloDto), ProtocolNames.Messages.Hello, "" },
            new object[] { typeof(HelloOkDto), ProtocolNames.Messages.HelloOk, "" },
            new object[] { typeof(ClockPongDto), ProtocolNames.Messages.ClockPong, "" },
            new object[] { typeof(ErrorDto), ProtocolNames.Messages.Error, "" },
            new object[] { typeof(ByeDto), ProtocolNames.Messages.Bye, "" },
            new object[] { typeof(RelayDto), ProtocolNames.Messages.Relay, "" },
            new object[] { typeof(SnapshotEndDto), ProtocolNames.Messages.SnapshotEnd, "" },
            new object[] { typeof(RoomCreatedDto), ProtocolNames.Messages.RoomCreated, "" },
            new object[] { typeof(RoomResumeDto), ProtocolNames.Messages.RoomResume, "" },
            new object[] { typeof(RoomResumedDto), ProtocolNames.Messages.RoomResumed, "" },
            new object[] { typeof(RoomStateDto), ProtocolNames.Messages.RoomState, "" },
            new object[] { typeof(PlayerInfoDto), ProtocolNames.Messages.RoomState, "$defs/PlayerInfo" },
            new object[] { typeof(AvatarDto), ProtocolNames.Messages.RoomState, "$defs/Avatar" },
            new object[] { typeof(PlayerPrefsDto), ProtocolNames.Messages.RoomState, "$defs/PlayerPrefs" },
            new object[] { typeof(SettingsStateDto), ProtocolNames.Messages.SettingsState, "" },
            new object[] { typeof(RoomSettingsDto), ProtocolNames.Messages.SettingsState, "$defs/RoomSettings" },
            new object[] { typeof(RoomA11yDto), ProtocolNames.Messages.SettingsState, "$defs/RoomA11y" },
            new object[] { typeof(SettingsPatchDto), ProtocolNames.Messages.SettingsSet, "$defs/SettingsPatch" },
            new object[] { typeof(RolesStateDto), ProtocolNames.Messages.RolesState, "" },
            new object[] { typeof(RoleGroupDto), ProtocolNames.Messages.RolesState, "$defs/RoleGroup" },
            new object[] { typeof(FlightVoteDto), ProtocolNames.Messages.RolesState, "properties/flightVotes/items" },
            new object[] { typeof(PhaseSetDto), ProtocolNames.Messages.PhaseSet, "" },
            new object[] { typeof(PhaseStepDto), ProtocolNames.Messages.PhaseSet, "properties/step/anyOf/0" },
            new object[] { typeof(GamePausedDto), ProtocolNames.Messages.GamePaused, "" },
            new object[] { typeof(GameResumedDto), ProtocolNames.Messages.GameResumed, "" },
        };

        [TestCaseSource(nameof(DtoCases))]
        public void Dto_FieldNamesMatchTheSchema(Type dto, string messageType, string path)
        {
            JObject schema = LoadSchema(messageType);
            JObject node = Select(schema, path);
            var properties = (JObject)node["properties"];
            Assert.IsNotNull(properties, messageType + " " + path + " has no properties");

            var expected = new HashSet<string>(properties.Properties().Select(p => p.Name), StringComparer.Ordinal);
            HashSet<string> actual = JsonPropertyNames(dto);

            CollectionAssert.AreEquivalent(expected, actual, dto.Name + " vs " + messageType + SchemaSuffix + " " + path);
        }

        /// <summary>Constant class, schema file and enum $def it mirrors: values must match exactly.</summary>
        private static readonly object[] EnumCases =
        {
            new object[] { typeof(ProtocolNames.ClientKinds), ProtocolNames.Messages.Hello, "ClientKind" },
            new object[] { typeof(ProtocolNames.ConnKinds), ProtocolNames.Messages.RoomResumed, "ConnKind" },
            new object[] { typeof(ProtocolNames.ErrorCodes), ProtocolNames.Messages.Error, "ErrorCode" },
            new object[] { typeof(ProtocolNames.ByeReasons), ProtocolNames.Messages.Bye, "ByeReason" },
            new object[] { typeof(ProtocolNames.PauseReasons), ProtocolNames.Messages.GamePaused, "PauseReason" },
            new object[] { typeof(ProtocolNames.RoleIds), ProtocolNames.Messages.RolesState, "RoleId" },
            new object[] { typeof(ProtocolNames.RoleAssignModes), ProtocolNames.Messages.SettingsState, "RoleAssignMode" },
            new object[] { typeof(ProtocolNames.AssistLevels), ProtocolNames.Messages.SettingsState, "AssistLevel" },
            new object[] { typeof(ProtocolNames.TallyVisibilities), ProtocolNames.Messages.SettingsState, "TallyVisibility" },
            new object[] { typeof(ProtocolNames.PilotRotations), ProtocolNames.Messages.SettingsState, "PilotRotation" },
            new object[] { typeof(ProtocolNames.PilotSelects), ProtocolNames.Messages.SettingsState, "PilotSelect" },
            new object[] { typeof(ProtocolNames.Phases), ProtocolNames.Messages.PhaseSet, "Phase" },
            new object[] { typeof(ProtocolNames.SubPhases), ProtocolNames.Messages.PhaseSet, "SubPhase" },
            new object[] { typeof(ProtocolNames.GameModes), ProtocolNames.Messages.PhaseSet, "GameMode" },
        };

        [TestCaseSource(nameof(EnumCases))]
        public void EnumConstants_MatchTheSchemaEnum(Type constants, string messageType, string defName)
        {
            JObject schema = LoadSchema(messageType);
            var values = (JArray)schema["$defs"][defName]["enum"];
            Assert.IsNotNull(values, messageType + " has no enum $defs/" + defName);

            CollectionAssert.AreEquivalent(values.Select(v => (string)v), ConstStrings(constants).Values, constants.Name + " vs " + defName);
        }

        [Test]
        public void RoomCodeAlphabet_MatchesTheRoomCodePattern()
        {
            JObject schema = LoadSchema(ProtocolNames.Messages.RoomCreated);
            var pattern = (string)schema["$defs"]["RoomCode"]["pattern"];
            var expected = "^[" + "A-HJ-NP-Z" + "]{" + ProtocolNames.RoomCodeLength + "}$";

            Assert.AreEqual(expected, pattern);
            var letters = new string(Enumerable.Range('A', 26).Select(c => (char)c).Where(c => c != 'I' && c != 'O').ToArray());
            Assert.AreEqual(letters, ProtocolNames.RoomCodeAlphabet);
        }

        [Test]
        public void EverySchemaExample_ParsesIntoItsDto()
        {
            foreach (object[] testCase in DtoCases)
            {
                var dto = (Type)testCase[0];
                var messageType = (string)testCase[1];
                var path = (string)testCase[2];
                if (path.Length != 0)
                {
                    continue;
                }

                foreach (JToken example in (JArray)LoadSchema(messageType)["examples"])
                {
                    MethodInfo read = typeof(ProtocolJson).GetMethod(nameof(ProtocolJson.TryRead)).MakeGenericMethod(dto);
                    var arguments = new object[] { (JObject)example, null, null };
                    bool ok = (bool)read.Invoke(null, arguments);
                    Assert.IsTrue(ok, dto.Name + " could not read the " + messageType + " example: " + arguments[2]);
                }
            }
        }
    }
}
