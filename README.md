# Servlerless WebRTC data communication
Avoid the use of a back-end to signal WebRTC connection instances between clients, use an intermediary file format that can be transferred via available relays like Messenger, Whatsapp and optionally encrypt the relayed contents to avoid deobfuscation.

this is a work in progress currently, will report as much as needed.

## Use
First, you are encouraged to spin up the server with ```node server.js```
This will give you access to an html version of this README in the browser by accessing localhost:8080

Most of the logic is handled by the caller, which can be obtained by pinging localhost:8080/caller

### Flow overview
The caller has the logic required to create a WebRTC connection object and embed its peer settings into a virtual html file.
This file contains the answer logic and is relayed through the server, not using the WebRTC API to maintain use-case demonstration.
The answer mechanic is essentially compiled by the client by feeding its own peer details into an object and building an html file with which a connection to the caller can be instantiated

The intended use is simply to design machine-illiterate cryptography through the use of personal questions to completely obfuscate later parts of the connection relationship

## Example
Not necessarily available here, but definitely a plan to test this type of flow as it will become increasingly sought after by the average user.

A very basic tool can be downloaded for free from many sources that enables the encryption and decryption of any file through a user-supplied question and answer.
The result of such encryption is a string that can be interpreted only when the appropriate answer is fed to the tool alongside the file string.
After unencryption, the file is simply loaded like any other webpage.

This offers a relatively high level of encryption compared to crackable algorithms. With the use of alternative channels, a much higher degree of privacy is achievable if desired.

A simple encryption tool is really all that is needed, and can be relayed through another encryption method if need be.

task: develop solid encryption protocol that is not sha256-similar, make a tool, start a small network