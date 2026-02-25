require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

const token = process.env.TOKEN;
const clientId = '1475828957629644976';
const guildId = '1256075997972009010';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.login(process.env.TOKEN);

// =======================
// 슬래시 명령어 등록
// =======================

const commands = [
  new SlashCommandBuilder()
    .setName('팀짜기')
    .setDescription('현재 음성채널 인원 팀 분배')
    .addIntegerOption(option =>
      option.setName('팀수')
        .setDescription('몇 팀으로 나눌지')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('모드')
        .setDescription('팀 구성 방식')
        .setRequired(true)
        .addChoices(
          { name: '전체 자동', value: 'auto' },
          { name: '선택해서 구성', value: 'select' }
        ))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: commands }
  );
  console.log('슬래시 명령어 등록 완료');
})();


// =======================
// 팀 생성 함수
// =======================

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function createTeams(members, teamCount) {
  shuffle(members);

  const teams = Array.from({ length: teamCount }, () => []);

  members.forEach((member, i) => {
    teams[i % teamCount].push(member);
  });

  return teams;
}


// =======================
// 인터랙션 처리
// =======================

client.on('interactionCreate', async interaction => {

  // -----------------------
  // 슬래시 명령어
  // -----------------------
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName !== '팀짜기') return;

    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: '❌ 음성채널에 먼저 들어가세요.',
        ephemeral: true
      });
    }

    const teamCount = interaction.options.getInteger('팀수');
    const mode = interaction.options.getString('모드');

    const members = voiceChannel.members
      .filter(m => !m.user.bot)
      .map(m => m);

    if (members.length < teamCount) {
      return interaction.reply({
        content: '❌ 인원이 팀수보다 적습니다.',
        ephemeral: true
      });
    }

    // 🔹 전체 자동
    if (mode === 'auto') {

      const teams = createTeams(members, teamCount);

      let result = '👥 **팀 배정 결과**\n\n';

      teams.forEach((team, i) => {
        result += `🔹 팀 ${i + 1}\n`;
        team.forEach(member => {
          result += `- ${member.displayName}\n`;
        });
        result += '\n';
      });

      return interaction.reply(result);
    }

    // 🔹 선택 모드
    if (mode === 'select') {

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`team_select_${teamCount}`)
        .setPlaceholder('참여할 인원 선택')
        .setMinValues(1)
        .setMaxValues(members.length)
        .addOptions(
          members.map(member => ({
            label: member.displayName,
            value: member.id
          }))
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.reply({
        content: '팀에 참여할 인원을 선택하세요.',
        components: [row],
        ephemeral: true
      });
    }
  }


  // -----------------------
  // 선택 메뉴
  // -----------------------
if (interaction.isStringSelectMenu()) {

  if (!interaction.customId.startsWith('team_select_')) return;

  const teamCount = parseInt(
    interaction.customId.split('_')[2]
  );

  const selectedMembers = interaction.values.map(id =>
    interaction.guild.members.cache.get(id)
  );

  if (selectedMembers.length < teamCount) {
    return interaction.update({
      content: '❌ 선택 인원이 팀수보다 적습니다.',
      components: []
    });
  }

  const teams = createTeams(selectedMembers, teamCount);

  let result = '👥 **팀 배정 결과**\n\n';

  teams.forEach((team, i) => {
    result += `🔹 팀 ${i + 1}\n`;
    team.forEach(member => {
      result += `- ${member.displayName}\n`;
    });
    result += '\n';
  });

  // 1️⃣ 선택창은 깔끔하게 닫아주고
  await interaction.update({
    content: '✅ 팀 배정이 완료되었습니다.',
    components: []
  });

  // 2️⃣ 결과는 채널 전체 공개
  await interaction.channel.send({
    content: result
    });

     return;
   }
});
client.login(token);