# Ansible 문서 아카이브

총 **184개** 문서 — 핵심 147 / `_reference/` 37

각 문서 상단 frontmatter의 `source_url`이 원문 링크입니다.

## 핵심 문서

> 아래 순서대로 읽으면 흐름이 이어집니다.

### `getting_started/` (6)

- [Ansible concepts](getting_started/basic_concepts.md)
- [Start automating with Ansible](getting_started/get_started_ansible.md)
- [Building an inventory](getting_started/get_started_inventory.md)
- [Creating a playbook](getting_started/get_started_playbook.md)
- [Getting started with Ansible](getting_started/index.md)
- [Introduction to Ansible](getting_started/introduction.md)

### `installation_guide/` (4)

- [Installation Guide](installation_guide/index.md)
- [Installing Ansible on specific operating systems](installation_guide/installation_distros.md)
- [Configuring Ansible](installation_guide/intro_configuration.md)
- [Installing Ansible](installation_guide/intro_installation.md)

### `inventory_guide/` (6)

- [Connection methods and details](inventory_guide/connection_details.md)
- [Implicit 'localhost'](inventory_guide/implicit_localhost.md)
- [Building Ansible inventories](inventory_guide/index.md)
- [Working with dynamic inventory](inventory_guide/intro_dynamic_inventory.md)
- [How to build your inventory](inventory_guide/intro_inventory.md)
- [Patterns: targeting hosts and groups](inventory_guide/intro_patterns.md)

### `playbook_guide/` (36)

- [Manipulating data](playbook_guide/complex_data_manipulation.md)
- [Playbook Example: Continuous Delivery and Rolling Upgrades](playbook_guide/guide_rolling_upgrade.md)
- [Using Ansible playbooks](playbook_guide/index.md)
- [Search paths in Ansible](playbook_guide/playbook_pathing.md)
- [Working with playbooks](playbook_guide/playbooks.md)
- [Advanced playbook syntax](playbook_guide/playbooks_advanced_syntax.md)
- [Asynchronous actions and polling](playbook_guide/playbooks_async.md)
- [Blocks](playbook_guide/playbooks_blocks.md)
- [Validating tasks: check mode and diff mode](playbook_guide/playbooks_checkmode.md)
- [Conditionals](playbook_guide/playbooks_conditionals.md)
- [Debugging tasks](playbook_guide/playbooks_debugger.md)
- [Controlling where tasks run: delegation and local actions](playbook_guide/playbooks_delegation.md)
- [Setting the remote environment](playbook_guide/playbooks_environment.md)
- [Error handling in playbooks](playbook_guide/playbooks_error_handling.md)
- [Executing playbooks](playbook_guide/playbooks_execution.md)
- [Using filters to manipulate data](playbook_guide/playbooks_filters.md)
- [Handlers: running operations on change](playbook_guide/playbooks_handlers.md)
- [Ansible playbooks](playbook_guide/playbooks_intro.md)
- [Lookups](playbook_guide/playbooks_lookups.md)
- [Loops](playbook_guide/playbooks_loops.md)
- [Module defaults](playbook_guide/playbooks_module_defaults.md)
- [Understanding privilege escalation: become](playbook_guide/playbooks_privilege_escalation.md)
- [Interactive input: prompts](playbook_guide/playbooks_prompts.md)
- [Python3 in templates](playbook_guide/playbooks_python_version.md)
- [Reusing Ansible artifacts](playbook_guide/playbooks_reuse.md)
- [Roles](playbook_guide/playbooks_reuse_roles.md)
- [Executing playbooks for troubleshooting](playbook_guide/playbooks_startnstep.md)
- [Controlling playbook execution: strategies and more](playbook_guide/playbooks_strategies.md)
- [Tags](playbook_guide/playbooks_tags.md)
- [Templating (Jinja2)](playbook_guide/playbooks_templating.md)
- [The now function: get the current time](playbook_guide/playbooks_templating_now.md)
- [The undef function: add hint for undefined variables](playbook_guide/playbooks_templating_undef.md)
- [Tests](playbook_guide/playbooks_tests.md)
- [Using variables](playbook_guide/playbooks_variables.md)
- [Play Argument Validation](playbook_guide/playbooks_variables_validation.md)
- [Discovering variables: facts and magic variables](playbook_guide/playbooks_vars_facts.md)

### `collections_guide/` (7)

- [Downloading collections](collections_guide/collections_downloading.md)
- [Collections index](collections_guide/collections_index.md)
- [Installing collections](collections_guide/collections_installing.md)
- [Listing collections](collections_guide/collections_listing.md)
- [Using collections in a playbook](collections_guide/collections_using_playbooks.md)
- [Verifying collections](collections_guide/collections_verifying.md)
- [Using Ansible collections](collections_guide/index.md)

### `command_guide/` (4)

- [Ansible CLI cheatsheet](command_guide/cheatsheet.md)
- [Working with command line tools](command_guide/command_line_tools.md)
- [Using Ansible command line tools](command_guide/index.md)
- [Introduction to ad hoc commands](command_guide/intro_adhoc.md)

### `vault_guide/` (5)

- [Protecting sensitive data with Ansible vault](vault_guide/index.md)
- [Ansible Vault](vault_guide/vault.md)
- [Encrypting content with Ansible Vault](vault_guide/vault_encrypting_content.md)
- [Managing vault passwords](vault_guide/vault_managing_passwords.md)
- [Using encrypted variables and files](vault_guide/vault_using_encrypted_content.md)

### `os_guide/` (13)

- [Using Ansible on Windows, BSD, and z/OS UNIX](os_guide/index.md)
- [Managing BSD hosts with Ansible](os_guide/intro_bsd.md)
- [Managing Windows hosts with Ansible](os_guide/intro_windows.md)
- [Managing z/OS UNIX hosts with Ansible](os_guide/intro_zos.md)
- [Windows App Control](os_guide/windows_app_control.md)
- [Desired State Configuration](os_guide/windows_dsc.md)
- [Windows performance](os_guide/windows_performance.md)
- [PowerShell 7 Support](os_guide/windows_pwsh.md)
- [Windows SSH](os_guide/windows_ssh.md)
- [Using Ansible and Windows](os_guide/windows_usage.md)
- [Windows Remote Management](os_guide/windows_winrm.md)
- [WinRM Certificate Authentication](os_guide/windows_winrm_certificate.md)
- [Kerberos Authentication](os_guide/windows_winrm_kerberos.md)

### `network/` (47)

- **dev_guide/**
  - [Developing network plugins](network/dev_guide/developing_plugins_network.md)
  - [Developing network resource modules](network/dev_guide/developing_resource_modules_network.md)
  - [Documenting new network platforms](network/dev_guide/documenting_modules_network.md)
  - [Network Developer Guide](network/dev_guide/index.md)
- **getting_started/**
  - [Basic Concepts](network/getting_started/basic_concepts.md)
  - [Build Your Inventory](network/getting_started/first_inventory.md)
  - [Run Your First Command and Playbook](network/getting_started/first_playbook.md)
  - [Network Getting Started](network/getting_started/index.md)
  - [Beyond the basics](network/getting_started/intermediate_concepts.md)
  - [Working with network connection options](network/getting_started/network_connection_options.md)
  - [How Network Automation is Different](network/getting_started/network_differences.md)
  - [Resources and next steps](network/getting_started/network_resources.md)
  - [Use Ansible network roles](network/getting_started/network_roles.md)
- **user_guide/**
  - [Parsing semi-structured text with Ansible](network/user_guide/cli_parsing.md)
  - [Ansible Network FAQ](network/user_guide/faq.md)
  - [Network Advanced Topics](network/user_guide/index.md)
  - [Ansible Network Examples](network/user_guide/network_best_practices_2.5.md)
  - [Network Debug and Troubleshooting Guide](network/user_guide/network_debug_troubleshooting.md)
  - [Network Resource Modules](network/user_guide/network_resource_modules.md)
  - [Working with command output and prompts in network modules](network/user_guide/network_working_with_command_output.md)
  - [CloudEngine OS Platform Options](network/user_guide/platform_ce.md)
  - [CNOS Platform Options](network/user_guide/platform_cnos.md)
  - [Dell OS10 Platform Options](network/user_guide/platform_dellos10.md)
  - [Dell OS6 Platform Options](network/user_guide/platform_dellos6.md)
  - [Dell OS9 Platform Options](network/user_guide/platform_dellos9.md)
  - [ENOS Platform Options](network/user_guide/platform_enos.md)
  - [EOS Platform Options](network/user_guide/platform_eos.md)
  - [ERIC_ECCLI Platform Options](network/user_guide/platform_eric_eccli.md)
  - [EXOS Platform Options](network/user_guide/platform_exos.md)
  - [FRR Platform Options](network/user_guide/platform_frr.md)
  - [ICX Platform Options](network/user_guide/platform_icx.md)
  - [Platform Options](network/user_guide/platform_index.md)
  - [IOS Platform Options](network/user_guide/platform_ios.md)
  - [IOS-XR Platform Options](network/user_guide/platform_iosxr.md)
  - [IronWare Platform Options](network/user_guide/platform_ironware.md)
  - [Junos OS Platform Options](network/user_guide/platform_junos.md)
  - [Meraki Platform Options](network/user_guide/platform_meraki.md)
  - [Netconf enabled Platform Options](network/user_guide/platform_netconf_enabled.md)
  - [Pluribus NETVISOR Platform Options](network/user_guide/platform_netvisor.md)
  - [NOS Platform Options](network/user_guide/platform_nos.md)
  - [NXOS Platform Options](network/user_guide/platform_nxos.md)
  - [RouterOS Platform Options](network/user_guide/platform_routeros.md)
  - [SLX-OS Platform Options](network/user_guide/platform_slxos.md)
  - [VOSS Platform Options](network/user_guide/platform_voss.md)
  - [VyOS Platform Options](network/user_guide/platform_vyos.md)
  - [WeOS 4 Platform Options](network/user_guide/platform_weos4.md)
  - [Validate data against set criteria with Ansible](network/user_guide/validate.md)

### `module_plugin_guide/` (5)

- [Using Ansible modules and plugins](module_plugin_guide/index.md)
- [Introduction to modules](module_plugin_guide/modules_intro.md)
- [Modules and plugins index](module_plugin_guide/modules_plugins_index.md)
- [Module maintenance and support](module_plugin_guide/modules_support.md)
- [Rejecting modules](module_plugin_guide/plugin_filtering_config.md)

### `tips_tricks/` (3)

- [General tips](tips_tricks/ansible_tips_tricks.md)
- [Ansible tips and tricks](tips_tricks/index.md)
- [Sample Ansible setup](tips_tricks/sample_setup.md)

### `scenario_guides/` (5)

- [Legacy Public Cloud Guides](scenario_guides/cloud_guides.md)
- [Alibaba Cloud Compute Services Guide](scenario_guides/guide_alicloud.md)
- [Online.net Guide](scenario_guides/guide_online.md)
- [Packet.net Guide](scenario_guides/guide_packet.md)
- [Scaleway Guide](scenario_guides/guide_scaleway.md)

### `getting_started_ee/` (6)

- [Building your first Execution Environment](getting_started_ee/build_execution_environment.md)
- [Getting started with Execution Environments](getting_started_ee/index.md)
- [Introduction to Execution Environments](getting_started_ee/introduction.md)
- [Running Ansible with the community EE image](getting_started_ee/run_community_ee_image.md)
- [Running your EE](getting_started_ee/run_execution_environment.md)
- [Setting up your environment](getting_started_ee/setup_environment.md)

## `_reference/` (별도 폴더)

통독용이 아니라 필요할 때 찾아보는 자료입니다. 폴더별 문서 수만 표시합니다.

- `collections/all_plugins.md/` — 1개
- `galaxy/dev_guide.md/` — 1개
- `galaxy/user_guide.md/` — 1개
- `plugins/action.md/` — 1개
- `plugins/become.md/` — 1개
- `plugins/cache.md/` — 1개
- `plugins/callback.md/` — 1개
- `plugins/cliconf.md/` — 1개
- `plugins/connection.md/` — 1개
- `plugins/docs_fragment.md/` — 1개
- `plugins/filter.md/` — 1개
- `plugins/httpapi.md/` — 1개
- `plugins/inventory.md/` — 1개
- `plugins/lookup.md/` — 1개
- `plugins/module.md/` — 1개
- `plugins/module_util.md/` — 1개
- `plugins/netconf.md/` — 1개
- `plugins/plugins.md/` — 1개
- `plugins/shell.md/` — 1개
- `plugins/strategy.md/` — 1개
- `plugins/terminal.md/` — 1개
- `plugins/test.md/` — 1개
- `plugins/vars.md/` — 1개
- `reference_appendices/YAMLSyntax.md/` — 1개
- `reference_appendices/automationhub.md/` — 1개
- `reference_appendices/common_return_values.md/` — 1개
- `reference_appendices/faq.md/` — 1개
- `reference_appendices/general_precedence.md/` — 1개
- `reference_appendices/glossary.md/` — 1개
- `reference_appendices/interpreter_discovery.md/` — 1개
- `reference_appendices/logging.md/` — 1개
- `reference_appendices/module_utils.md/` — 1개
- `reference_appendices/python_3_support.md/` — 1개
- `reference_appendices/release_and_maintenance.md/` — 1개
- `reference_appendices/special_variables.md/` — 1개
- `reference_appendices/test_strategies.md/` — 1개
- `reference_appendices/tower.md/` — 1개

```bash
# 예: Ansible 레퍼런스에서 키워드 찾기
grep -ril "검색어" _reference/ | head
```

