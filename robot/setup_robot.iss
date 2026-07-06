; ══════════════════════════════════════════════════════
;  Inno Setup Script — KTRM Robot Installer
;  ТОО «Vertex Metrology» · U2B-Vertex ERP
;  Создаёт setup.exe для установки робота на Windows
; ══════════════════════════════════════════════════════
; Как собрать:
;   1. Установите Inno Setup: https://jrsoftware.org/isinfo.php
;   2. Установите PyInstaller: pip install pyinstaller
;   3. Соберите .exe: pyinstaller --onefile ktrm_robot.py
;   4. Откройте этот файл в Inno Setup → Compile
;   5. В папке Output появится ktrm_robot_setup.exe

[Setup]
AppName=KTRM Robot — Vertex Metrology
AppVersion=1.0
AppPublisher=U2B-Vertex
AppPublisherURL=https://u2b-vertex-erp.vercel.app
DefaultDirName={autopf}\KTRM Robot
DefaultGroupName=KTRM Robot
OutputBaseFilename=ktrm_robot_setup
SetupIconFile=icon.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern
; Требуем права администратора для установки
PrivilegesRequired=admin

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"

[Tasks]
Name: "desktopicon";   Description: "Создать ярлык на рабочем столе"; GroupDescription: "Дополнительно:"
Name: "startupicon";   Description: "Запускать при старте Windows";   GroupDescription: "Дополнительно:"

[Files]
; Главный исполняемый файл (собранный PyInstaller)
Source: "dist\ktrm_robot.exe";   DestDir: "{app}"; Flags: ignoreversion

; Файл конфигурации (пример)
Source: "robot.env.example";     DestDir: "{app}"; DestName: ".env.example"; Flags: ignoreversion

; README
Source: "README_robot.txt";      DestDir: "{app}"; Flags: ignoreversion isreadme

[Icons]
; Ярлык в меню пуск
Name: "{group}\KTRM Robot";            Filename: "{app}\ktrm_robot.exe"
Name: "{group}\Настройки (.env)";      Filename: "{app}\.env"; Flags: dontcloseonexit
Name: "{group}\Лог робота";            Filename: "{app}\ktrm_robot.log"
Name: "{group}\Удалить KTRM Robot";    Filename: "{uninstallexe}"

; Ярлык на рабочем столе
Name: "{autodesktop}\KTRM Robot";      Filename: "{app}\ktrm_robot.exe"; Tasks: desktopicon

; Автозапуск при старте Windows
Name: "{userstartup}\KTRM Robot";      Filename: "{app}\ktrm_robot.exe"; Tasks: startupicon

[Run]
; Показать README после установки
Filename: "{app}\README_robot.txt"; Description: "Открыть инструкцию"; Flags: postinstall shellexec skipifsilent

; Открыть .env для настройки
Filename: "notepad.exe"; Parameters: "{app}\.env.example"; Description: "Настроить конфигурацию"; Flags: postinstall skipifsilent

[Code]
// Проверка наличия NCALayer перед установкой
function InitializeSetup(): Boolean;
begin
  Result := True;
  if not FileExists(ExpandConstant('{pf}\NCALayer\NCALayer.exe')) and
     not FileExists(ExpandConstant('{pf(x86)}\NCALayer\NCALayer.exe')) then
  begin
    if MsgBox(
      'NCALayer не обнаружен на этом компьютере.' + #13#10 +
      'NCALayer необходим для работы с ЭЦП.' + #13#10#13#10 +
      'Скачать NCALayer: https://ncl.pki.gov.kz' + #13#10#13#10 +
      'Продолжить установку без NCALayer?',
      mbConfirmation, MB_YESNO
    ) = IDNO then
      Result := False;
  end;
end;

// Создать пустой .env из примера после установки
procedure CurStepChanged(CurStep: TSetupStep);
var
  EnvPath, ExamplePath: String;
begin
  if CurStep = ssPostInstall then
  begin
    EnvPath     := ExpandConstant('{app}\.env');
    ExamplePath := ExpandConstant('{app}\.env.example');
    if not FileExists(EnvPath) then
      FileCopy(ExamplePath, EnvPath, False);
  end;
end;
