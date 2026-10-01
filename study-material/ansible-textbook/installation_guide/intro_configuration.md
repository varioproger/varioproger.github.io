---
title: Configuring Ansible
product: ansible
source_url: https://docs.ansible.com/ansible/latest/installation_guide/intro_configuration.html
source_path: ansible/ansible-documentation:docs/docsite/rst/installation_guide/intro_configuration.rst
---

# Configuring Ansible

This topic describes how to control Ansible settings.

## Configuration file

Certain settings in Ansible are adjustable with a configuration file (`ansible.cfg`).
The stock configuration should be sufficient for most users, but there may be reasons you would want to change them.

Paths where the configuration file is searched are listed in reference documentation.

### Getting the latest configuration

If installing Ansible from a package manager, the latest `ansible.cfg` file should be present in `/etc/ansible`, possibly
as a `.rpmnew` file (or other) as appropriate in the case of updates.

If you installed Ansible from `pip` or from the source, you may want to create this file to override
default settings in Ansible.

You can generate an Ansible configuration file, `ansible.cfg`, that lists all default settings as follows:

``` console
$ ansible-config init --disabled > ansible.cfg
```

Include available plugins to create a more complete Ansible configuration as follows:

``` console
$ ansible-config init --disabled -t all > ansible.cfg
```

For more details and a full listing of available configurations go to configuration_settings.

You can use the ansible-config command-line utility to list your available options and inspect the current values.

For in-depth details, see ansible_configuration_settings.

## Environmental configuration

Ansible also allows configuring settings using environment variables.

If these environment variables are set, they will override any associated settings loaded from the configuration file.
You can get a full listing of available environment variables from:

- ansible_configuration_settings: for configuring core functionality
- list_of_collection_env_vars: for configuring plugins in collections

## Command line options

Not all configuration options are present in the command line, just the ones deemed most useful or common.
Settings in the command line will override those passed through the configuration file and the environment.

The full list of options available is in ansible-playbook and ansible.
